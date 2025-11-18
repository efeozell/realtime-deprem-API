import WebSocket from "ws";
import axios from "axios";

const EMSC_WEBSOCKET_URL = "wss://www.seismicportal.eu/standing_order/websocket";

class DepremService {
  constructor(io, apiCallback = null) {
    this.io = io;
    this.apiCallback = apiCallback;
    this.emscSocket = null;
  }

  connect() {
    console.log("[GOZCU] EMSC WebSocket baglantisi kuruluyor...");

    this.emscSocket = new WebSocket(EMSC_WEBSOCKET_URL);

    let heartbeatInterval;

    const startHeartbeat = () => {
      clearInterval(heartbeatInterval);

      heartbeatInterval = setInterval(() => {
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
      clearInterval(heartbeatInterval);
      console.log("[GOZCU] 10 saniye icinde yeniden baglanilacak...");
      setTimeout(() => this.connect(), 10000);
    });

    this.emscSocket.on("error", (error) => {
      console.log("[GOZCU] WebSocket hatasi: ", error.message);

      this.emscSocket.terminate();
    });
  }

  async processDepremData(p) {
    const buyukluk = parseFloat(p.mag);
    const enlem = p.lat;
    const boylam = p.lon;

    // Turkey kontrolü ve büyüklük filtresi
    const turkeydeDepremMi = p.flynn_region && p.flynn_region.toLowerCase().includes("turkey");

    //TODO: Buyukluk ayarlanacak
    if (buyukluk >= 0.5 && turkeydeDepremMi) {
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
    } else {
      if (!turkeydeDepremMi) {
        console.log(`[GIRDI] Turkiye disi deprem: ${p.flynn_region} (${buyukluk}), yayinlanmadi`);
      } else {
        console.log(`[GIRDI] Dusuk Buyukluk: ${p.flynn_region} (${buyukluk}), yayinlanmadi`);
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
