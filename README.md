# 📡 Gerçek Zamanlı Deprem Uyarı API'si (OBS Entegrasyonlu) 🌍

Yayincilarin OBS'de kullanabilecegi bir API tasarladim ayni bu projenin icinde bir Client olusturdum canliya aldigim url ile birlikte
OBS'de tarayici eklentisine ekleyerek kullanabilirler

## 🛠️ Nasıl Çalışıyor? (Teknik Akış)

Sistem, iki ana bileşen üzerine kuruludur:

1.  **Gözcü Servisi (Watcher - Node.js Client):** EMSC (Avrupa-Akdeniz Sismoloji Merkezi) gibi yetkili kaynaklardan gelen gerçek zamanlı deprem akışına (WebSocket/SSE) bağlanır.
2.  **Anons Sistemi (Broadcaster - Socket.IO Server):** Yayıncıların OBS'ten bağlandığı merkezdir.

- Gözcü, gelen veriyi 4.0 ve üzeri büyüklük gibi kriterlere göre **filtreler** (Gereksiz uyarıları engellemek için).
- Filtreden geçen deprem verileri, TERS COĞRAFİ KODLAMA (Reverse Geocoding) ile **İL/İLÇE** bilgisine dönüştürülür.
- Bu zenginleştirilmiş veri, Anons Sistemi aracılığıyla **tüm bağlı OBS Overlay'lerine anlık olarak iletilir (Push).**

## 💻 OBS Entegrasyonu

OBS'te kullanılan Tarayıcı Kaynağı (Browser Source), sunucuya Socket.IO üzerinden bağlanır ve pasif olarak bekler. Bir bildirim geldiğinde, CSS animasyonları ve ses efektiyle anlık olarak ekranda belirir.
