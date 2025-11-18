import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { ENV } from "./config/env.js";
import path from "path";
import { fileURLToPath } from "url";
import DepremService from "./services/depremService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const PORT = ENV.PORT || 5151;

// Static dosyalar için middleware
app.use(express.static(path.join(__dirname, "public")));

// Deprem servisi başlat (API callback ile)
const depremService = new DepremService(io, sendToAPIClients);

io.on("connection", (socket) => {
  console.log(`[BILDIRIM] Yeni bir dinleyici baglandi. ID: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`[BILDIRIM] Bir dinleyici ayrildi. ID: ${socket.id}`);
  });
});

// Routes (Endpoints)
app.get("/", (req, res) => {
  res.json({
    message: "Realtime Deprem API",
    version: "1.0.0",
    endpoints: {
      "GET /": "API Bilgileri",
      "GET /api/deprem-dinle": "HTTP API - Deprem bildirimlerini JSON stream olarak dinle",
      "GET /api/docs": "API Dokümantasyonu ve kullanım örnekleri",
      "GET /test-alert": "Manuel test deprem bildirimi gönder (API + OBS)",
      "GET /obs-overlay": "OBS Browser Source için overlay sayfası",
      "GET /health": "Sistem durumu",
      "WebSocket /": "Realtime deprem bildirimleri (Socket.IO)",
    },
    usage: {
      "HTTP API": "curl http://localhost:5151/api/deprem-dinle",
      WebSocket: "Socket.IO client ile ws://localhost:5151 adresine bağlan",
    },
  });
});

// OBS Overlay endpoint'i
app.get("/obs-overlay", (req, res) => {
  // Cache'i engellemek ve autoplay'i etkinleştirmek için headers
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // OBS Browser Source için autoplay permissions
  res.setHeader("Permissions-Policy", "autoplay=self");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");

  res.sendFile(path.join(__dirname, "public", "obs-overlay.html"));
});

// Aktif API bağlantılarını takip et
const activeAPIConnections = new Set();

// Deprem API endpoint'i - HTTP Streaming
app.get("/api/deprem-dinle", (req, res) => {
  console.log(`[API] Yeni API istemcisi baglandi: ${req.ip}`);

  // Response headers ayarla (Server-Sent Events benzeri)
  res.writeHead(200, {
    "Content-Type": "text/plain",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
  });

  // İlk bağlantı mesajı
  const welcomeMessage = {
    status: "connected",
    message: "Deprem API'sine baglanildi. Turkiye depremleri dinleniyor...",
    timestamp: new Date().toISOString(),
    server: "Realtime Deprem API v1.0",
  };

  res.write(JSON.stringify(welcomeMessage) + "\n\n");

  // Bu bağlantıyı aktif listede sakla
  activeAPIConnections.add(res);

  // İstemci bağlantısı kesildiğinde temizlik yap
  req.on("close", () => {
    activeAPIConnections.delete(res);
    console.log(`[API] API istemcisi baglantisi kesildi: ${req.ip}`);
  });

  req.on("error", (error) => {
    activeAPIConnections.delete(res);
    console.error("[API] API baglanti hatasi:", error);
  });
});

app.get("/test-alert", (req, res) => {
  const testData = {
    buyukluk: 4.5,
    il: "Istanbul",
    ilce: "Kadikoy",
    zaman: new Date().toISOString(),
    derinlik: 10,
    tamBolgeAdi: "MARMARA SEA",
  };

  console.log(`[TEST] Manuel test depremi gonderiliyor: ${testData.il} - ${testData.buyukluk}`);
  console.log(`[TEST] Aktif Socket.IO bağlantıları: ${io.engine.clientsCount}`);
  console.log(`[TEST] Bağlı client ID'leri:`, Array.from(io.sockets.sockets.keys()));

  // API clientlara gönder
  sendToAPIClients(testData);

  // Socket.IO (OBS overlay) clientlara gönder
  io.emit("yeni_deprem", testData);
  console.log(`[TEST] Socket.IO emit tamamlandı`);

  res.json({
    status: "success",
    message: "Test deprem bildirimi gonderildi",
    data: testData,
    sent_to: {
      api_clients: activeAPIConnections.size,
      websocket_clients: io.engine.clientsCount,
    },
  });
});

// Deprem bildirimlerini API bağlantılarına gönder
function sendToAPIClients(depremData) {
  if (activeAPIConnections.size > 0) {
    const apiResponse = {
      type: "earthquake_alert",
      data: {
        magnitude: depremData.buyukluk,
        location: {
          province: depremData.il,
          district: depremData.ilce,
          fullRegion: depremData.tamBolgeAdi,
        },
        time: depremData.zaman,
        depth: depremData.derinlik,
        coordinates: {
          latitude: depremData.lat || null,
          longitude: depremData.lon || null,
        },
      },
      timestamp: new Date().toISOString(),
      source: "EMSC",
    };

    const jsonData = JSON.stringify(apiResponse) + "\n\n";

    // Tüm aktif API bağlantılarına gönder
    activeAPIConnections.forEach((connection) => {
      try {
        connection.write(jsonData);
        console.log(`[API] Deprem bildirimi gonderildi: ${depremData.il} - ${depremData.buyukluk}`);
      } catch (error) {
        console.error("[API] Bildirim gonderme hatasi:", error);
        activeAPIConnections.delete(connection);
      }
    });
  }
}

// API Dokümantasyon endpoint'i
app.get("/api/docs", (req, res) => {
  res.json({
    title: "Realtime Deprem API Dokümantasyonu",
    version: "1.0.0",
    description: "Türkiye depremlerini gerçek zamanlı olarak dinlemek için HTTP API",
    endpoints: {
      "/api/deprem-dinle": {
        method: "GET",
        description: "Deprem bildirimlerini HTTP stream olarak dinle",
        response_format: "JSON Lines (her satır bir JSON objesi)",
        content_type: "text/plain",
        connection: "keep-alive",
        example_response: {
          connection: {
            status: "connected",
            message: "Deprem API'sine baglanildi. Turkiye depremleri dinleniyor...",
            timestamp: "2024-11-18T21:28:24.000Z",
            server: "Realtime Deprem API v1.0",
          },
          earthquake_data: {
            type: "earthquake_alert",
            data: {
              magnitude: 4.2,
              location: {
                province: "İstanbul",
                district: "Beşiktaş",
                fullRegion: "MARMARA SEA",
              },
              time: "2024-11-18T21:30:15.000Z",
              depth: 8.5,
              coordinates: {
                latitude: 41.0082,
                longitude: 29.0181,
              },
            },
            timestamp: "2024-11-18T21:30:15.000Z",
            source: "EMSC",
          },
        },
        usage_examples: {
          curl: "curl http://localhost:5151/api/deprem-dinle",
          javascript: `fetch('http://localhost:5151/api/deprem-dinle')
  .then(response => response.body.getReader())
  .then(reader => {
    function read() {
      return reader.read().then(({done, value}) => {
        if (done) return;
        const text = new TextDecoder().decode(value);
        console.log('Deprem verisi:', text);
        return read();
      });
    }
    return read();
  });`,
          python: `import requests
response = requests.get('http://localhost:5151/api/deprem-dinle', stream=True)
for line in response.iter_lines():
    if line:
        print(json.loads(line.decode('utf-8')))`,
        },
      },
    },
    filters: {
      magnitude: "≥ 0.5",
      region: "Turkey only",
      source: "EMSC (European Mediterranean Seismological Centre)",
    },
    notes: [
      "Bu endpoint keep-alive bağlantı kurar ve sürekli açık kalır",
      "Her deprem bildirimi ayrı bir satırda JSON formatında gelir",
      "Bağlantı koptuğunda otomatik yeniden bağlanma gerekir",
      "Sadece Türkiye bölgesindeki depremler filtrelenir",
    ],
  });
});

// Health check endpoint'i
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
    api_connections: activeAPIConnections.size,
  });
});

httpServer.listen(PORT, () => {
  console.log(`Radyo Istasyonu ${PORT} portunda yayina basladi...`);
  console.log(`OBS Overlay URL: http://localhost:${PORT}/obs-overlay`);

  // Deprem servisini başlat
  depremService.connect();
});
