# 📡 Yayincilar icin gercek zamanli Deprem Bildirim Sistemi 🌍

Yayincilarin OBS'de kullanabilecegi bir API tasarladim ve birde client olusturdum, yayinda anlik olarak ayarladigim siddette gore ve yaptigim filtrelemelere gore anlik olarak yayinda OBS'in tarayici eklentisi sayesinde gozukmesini saglayacaktir binlerce kisi anlik olarak siddetli bir deprem oldugunda panik yapiyor anlik olarak bilgi kirliligi olmamasi ve yayini izleyen izleyicilerin bilgilenmesi ve onlem almasi icin tasarladigim bu projede umarim faydali olur.

![Uygulama Ekran Kaydi](https://res.cloudinary.com/daxv08juo/video/upload/v1763578694/deprem_bildirim_jkbdxx.mp4)

## 🛠️ Nasıl Çalışıyor? (Teknik Akış)

Sistem, iki ana bileşen üzerine kuruludur:

1.  **Gözcü Servisi (Watcher - Node.js Client):** EMSC (Avrupa-Akdeniz Sismoloji Merkezi) gibi yetkili kaynaklardan gelen gerçek zamanlı deprem akışına (WebSocket/SSE) bağlanır.
2.  **Anons Sistemi (Broadcaster - Socket.IO Server):** Yayıncıların OBS'ten bağlandığı merkezdir.

- Gözcü, gelen veriyi 4.0 ve üzeri büyüklük gibi kriterlere göre **filtreler** (Gereksiz uyarıları engellemek için).
- Filtreden geçen deprem verileri, TERS COĞRAFİ KODLAMA (Reverse Geocoding) ile **İL/İLÇE** bilgisine big data clodu API'si kullanilarak il ilceye dönüştürülür.
- Bu zenginleştirilmiş veri, Anons Sistemi aracılığıyla **tüm bağlı OBS Overlay'lerine anlık olarak iletilir (Push).**

## 💻 OBS Entegrasyonu

OBS'te kullanılan Tarayıcı Kaynağı (Browser Source), sunucuya Socket.IO üzerinden bağlanır ve pasif olarak bekler. Bir bildirim geldiğinde, CSS animasyonları ve ses efektiyle anlık olarak ekranda belirir.

Sahne Ekle => Tarayici Kaynagi => localhost:5151/obs-overlay

## 💻 Adım 2: Klonlama ve Yükleme

1.  **Depoyu Klonlayın:** Terminali açın ve projeyi indirin.

    ```bash
    git clone https://github.com/efeozell/realtime-deprem-API
    cd api
    ```

2.  **Bağımlılıkları Yükleyin:** Projenin tüm Node.js paketlerini (`express`, `socket.io`, vb.) yükleyin.
    ```bash
    npm install
    ```

---

## ⚙️ Adım 3: Ortam Değişkenlerini Ayarlama (`.env`)

Projenin ana dizininde **`.env`** adında bir dosya oluşturun ve aşağıdaki değişkenleri doldurun. Bu, Redis'e bağlanmak için hayati önemli.

**PORT**=5151
**UPSTASH_REDIS_REST_URL**="URL"
**UPSTASH_REDIS_REST_TOKEN**="AZj7AAIncDI5TA2jFNGFZDg0ZGE3OM"
