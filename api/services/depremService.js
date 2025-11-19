import WebSocket from "ws";
import axios from "axios";
import { redis } from "../config/redis.js";

const EMSC_WEBSOCKET_URL = "wss://www.seismicportal.eu/standing_order/websocket";

class DepremService {
  constructor(io, apiCallback = null) {
    this.io = io;
    this.apiCallback = apiCallback;
    this.emscSocket = null;
    this.heartbeatInterval = null;
  }

  connect() {
    console.log("[GOZCU] EMSC WebSocket baglantisi kuruluyor...");

    this.emscSocket = new WebSocket(EMSC_WEBSOCKET_URL);

    const startHeartbeat = () => {
      clearInterval(this.heartbeatInterval);

      this.heartbeatInterval = setInterval(() => {
        if (this.emscSocket && this.emscSocket.readyState === WebSocket.OPEN) {
          this.emscSocket.ping();
        }
      }, 30000);
    };

    this.emscSocket.on("open", () => {
      console.log("[GOZCU] EMSC WebSocket yayinina baglandi. Depremler dinleniyor...");
      startHeartbeat();
    });

    this.emscSocket.on("pong", () => {
      console.log("[GOZCU] EMSC WebSocket pong alindi. (Baglantı canlı)");
    });

    this.emscSocket.on("message", async (data) => {
      try {
        const depremVerisi = JSON.parse(data.toString());

        if (depremVerisi.data && depremVerisi.data.properties) {
          const p = depremVerisi.data.properties;
          console.log(`[GOZCU] YENI BIR HAM HABER ALINDI: ${p.flynn_region} - Buyukluk: ${p.mag}`);

          await this.processDepremData(p);
        }
      } catch (error) {
        console.log("[GOZCU] Gelen EMSC verisi islenirken hata: ", error);
      }
    });

    this.emscSocket.on("close", () => {
      console.warn("[GOZCU] EMSC baglantisi koptu. 10 saniye icinde yeniden baglaniliyor...");
      clearInterval(this.heartbeatInterval);
      console.log("[GOZCU] 10 saniye icinde yeniden baglanilacak...");
      setTimeout(() => this.connect(), 10000);
    });

    this.emscSocket.on("error", (error) => {
      console.log("[GOZCU] WebSocket hatasi: ", error.message);

      this.emscSocket.terminate();
    });
  }

  async processDepremData(p) {
    // Veri kontrolü - p objesinin geçerli olduğundan emin ol
    if (!p || typeof p !== "object") {
      console.log("[HATA] Geçersiz deprem verisi:", p);
      return;
    }

    // Gerekli alanların varlığını kontrol et
    if (!p.mag || !p.lat || !p.lon || !p.flynn_region) {
      console.log("[HATA] Eksik deprem verisi alanları:", p);
      return;
    }

    const buyukluk = parseFloat(p.mag);
    const enlem = parseFloat(p.lat);
    const boylam = parseFloat(p.lon);

    // NaN kontrolü
    if (isNaN(buyukluk) || isNaN(enlem) || isNaN(boylam)) {
      console.log("[HATA] Geçersiz sayısal değerler:", { mag: p.mag, lat: p.lat, lon: p.lon });
      return;
    }

    console.log("TUM DEPREM VERISI: ", p);

    // İlk filtreler: Turkey + AFAD + büyüklük kontrolü
    const turkeydeDepremMi =
      p.flynn_region && typeof p.flynn_region === "string" && p.flynn_region.toLowerCase().includes("turkey");
    const afadDepremMi = p.auth === "AFAD";

    // Erken çıkış: Sadece Türkiye + AFAD + yeterli büyüklükteki depremlerle devam et
    if (!turkeydeDepremMi) {
      console.log(`[GIRDI] Turkiye disi deprem: ${p.flynn_region || "BILINMIYOR"} (${buyukluk}), yayinlanmadi`);
      return;
    }

    if (!afadDepremMi) {
      console.log(
        `[GIRDI] AFAD olmayan deprem: ${p.flynn_region} (${p.auth || "NO_AUTH"} - ${buyukluk}), yayinlanmadi`
      );
      return;
    }

    if (buyukluk > 0.5) {
      console.log(`[GIRDI] Dusuk Buyukluk: ${p.flynn_region} (${buyukluk}), yayinlanmadi`);
      return;
    }

    // source_id kontrolü - Redis'te var mı?
    const sourceId = p.source_id;
    if (!sourceId) {
      console.log("[HATA] source_id bulunamadı:", p);
      return;
    }

    // Redis duplicate kontrolü (sadece işlenecek depremler için)
    let isRedisCached = null;
    try {
      console.log(`[REDIS] Kontrol ediliyor: deprem:${sourceId}`);
      isRedisCached = await redis.get(`deprem:${sourceId}`);

      if (isRedisCached) {
        console.log(`[REDIS] DUPLICATE ENGELLENDI: ${sourceId} - ${p.flynn_region} (${buyukluk})`);
        return; // Bu deprem daha önce işlenmiş
      }

      console.log(`[REDIS] Yeni deprem tespit edildi: ${sourceId}`);
    } catch (redisError) {
      console.log("[REDIS] Kontrol hatası (devam ediliyor):", redisError.message || redisError);
      // Redis hatası durumunda işleme devam et ama uyar
      console.log("[UYARI] Redis kontrol edilemedi, duplicate kontrolü atlandı");
    }

    // Bu noktada tüm filtreler geçildi, işleme başla
    console.log(`[GECTI] Tum filtreler gecildi: ${p.flynn_region} (AFAD-${buyukluk}) - Isleniyor...`);

    //TODO: Buyukluk ayarlanacak
    {
      let adresBilgisi = { il: p.flynn_region, ilce: "Bilinmiyor" };

      try {
        const geoApiUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${enlem}&longitude=${boylam}&localityLanguage=tr`;
        const response = await axios.get(geoApiUrl);
        if (response.data) {
          adresBilgisi.il = response.data.principalSubdivision;
          adresBilgisi.ilce = response.data.locality || "Bilinmiyor";
          console.log(`[GOZCU] Adres Cevrildi: ${adresBilgisi.il}, ${adresBilgisi.ilce}`);
        }
      } catch (geoError) {
        console.log("[GOZCU] Adres cevirme hatasi: ", geoError.message);
        adresBilgisi.il = p.flynn_region;
      }

      const yayinVerisi = {
        buyukluk: buyukluk,
        il: adresBilgisi.il,
        ilce: adresBilgisi.ilce,
        zaman: p.time,
        derinlik: p.depth,
        tamBolgeAdi: p.flynn_region,
      };

      console.log(`[ANONS] ${yayinVerisi.il} - ${yayinVerisi.ilce} (${yayinVerisi.buyukluk}) YAYINLANIYOR!`);

      // Socket.IO'ya gönder
      this.io.emit("yeni_deprem", yayinVerisi);

      // API bağlantılarına da gönder
      if (this.apiCallback) {
        this.apiCallback(yayinVerisi);
      }

      // Başarılı yayından sonra Redis'e kaydet (24 saat TTL)
      try {
        const redisData = {
          source_id: sourceId,
          flynn_region: p.flynn_region,
          mag: buyukluk,
          processed_at: new Date().toISOString(),
          yayinlandi: true,
        };

        console.log(`[REDIS] Kaydediliyor: deprem:${sourceId}`);

        const setResult = await redis.setex(`deprem:${sourceId}`, 86400, JSON.stringify(redisData));

        console.log(`[REDIS] ✅ Başarıyla kaydedildi: deprem:${sourceId}`, setResult);
      } catch (redisError) {
        console.log(`[REDIS] ❌ Kaydetme hatası: ${redisError.message || redisError}`);
        console.log("[UYARI] Redis'e kaydedilemedi ama yayın başarılı");
      }
    }
  }

  disconnect() {
    if (this.emscSocket) {
      this.emscSocket.close();
    }
  }
}

export default DepremService;
