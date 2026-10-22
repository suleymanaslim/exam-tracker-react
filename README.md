# StudyTracker

Sınav hazırlığını tek çalışma alanında yönetmek için geliştirilen web uygulaması. Çalışma sürelerini, denemeleri, soru hedeflerini, konuları ve video planlarını takip eder.

## Özellikler

- **Çalışma alanı:** Pomodoro, kronometre, kesintisiz odak ve soru çözümü oturumları; sekme yenilendiğinde oturum kurtarma.
- **Deneme çözümü:** 80/180 dakika ve özel süre seçenekleri, kronometre, otomatik numaralı adlar, sekme kapandıktan sonra süreyi geri yükleme ve sonuç girişine geçiş.
- **Planlama:** Haftalık çalışma planı, günlük ve haftalık soru hedefleri, video ders takvimi ve aylık konu hedefleri.
- **Gelişim takibi:** Çalışma geçmişi, ders dağılımı, deneme sonuçları, net değişimleri ve soru istatistikleri.
- **Konu yönetimi:** Kişisel listeler ve hesap bazında seçilen ortak AGS konuları.
- **Yönetim:** Kullanıcı yönetimi, izinlerle kontrol edilen aylık plan paylaşımı ve topluluk görünürlüğü.
- **Dışa aktarma:** Çalışma raporları ve yazdırılabilir video planları.

## Teknolojiler

React 19, TypeScript, Vite 8, Tailwind CSS 4, Zustand, Supabase ve Recharts. Cloudflare üzerinde statik dosyalar ve SPA yönlendirmesiyle çalışır.

## Geliştirme

Node.js 24 veya daha yeni bir sürüm kullanın.

```bash
git clone https://github.com/suleymanaslim/exam-tracker-react.git
cd exam-tracker-react
npm install
cp .env.example .env.local
```

`.env.local` dosyasına Supabase projenizin adresini ve tarayıcıda kullanılabilen anahtarını ekleyin:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

```bash
npm run dev
npm test
npm run lint
npm run build
```

## Tarayıcı regresyon ve performans testi

Test, gerçek kullanıcı verisi yerine sahte Supabase yanıtları kullanır. Sayfa geçişlerini, grafiklerin gerektiğinde yüklenmesini ve profil sorgusunun normal sayfaları bekletmemesini denetler.

```bash
npx playwright install chromium
VITE_SUPABASE_URL=https://exam-test.supabase.co VITE_SUPABASE_ANON_KEY=fixture npm run build
npm run test:browser
```

Önceki sürümün aynı değişkenlerle üretilmiş `dist` klasörünü `PERF_BASELINE_DIST` ortam değişkeniyle verirseniz aynı gecikmeler altında önce/sonra karşılaştırması da yapılır. Bu testteki süreler canlı ağın veya Supabase sunucusunun performans garantisi değildir.

## Dağıtım

Cloudflare Git entegrasyonunda build komutu `npm run build`, çıktı klasörü `dist` olarak kullanılır. İki `VITE_SUPABASE_*` değişkeni hem production hem preview ortamının **build değişkenlerinde** tanımlanmalıdır. `wrangler.jsonc`, Workers üzerinde statik dosyaları ve SPA yönlendirmesini yapılandırır. Preview dalları üretimden ayrı incelenebilir.

## Veri ve yetkiler

`supabase/migrations/` altındaki SQL dosyaları ilgili özelliklerin şemasını, fonksiyonlarını ve RLS politikalarını içerir. Frontend dağıtımı bu SQL dosyalarını veritabanında otomatik çalıştırmaz. Yönetici parola işleminin kurulum ayrıntıları `supabase/functions/admin-change-password/README.md` içindedir.

Arayüz, mevcut oturum bilgisini kullanarak tekrar eden kimlik isteklerini azaltır; veri erişimini Supabase JWT ve RLS politikaları doğrular. Başarılı veri okumaları yalnızca açık sekmenin belleğinde kısa süre tutulur. Yazma işlemleri, hesap değişimi ve ilgili güncelleme olayları önbelleği temizler. Erişim kontrolü yapan RPC yanıtları kalıcı olarak önbelleğe alınmaz.

## Proje yapısı

| Dizin | İçerik |
| --- | --- |
| `src/pages` | İhtiyaç olduğunda yüklenen sayfalar |
| `src/components` | Ortak arayüz bileşenleri |
| `src/lib` | Veri erişimi, oturumlar, sayaçlar ve analizler |
| `supabase` | Veritabanı geçişleri ve Edge Function |
| `tests` | Hesap izolasyonu, veri doğruluğu, sayaç ve önbellek testleri |
| `public` | Kullanılan logo, favicon ve sayaç sesi |
