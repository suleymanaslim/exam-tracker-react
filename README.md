# StudyTracker

Sınav hazırlığını tek çalışma alanında yönetmek için geliştirilen web uygulaması. Çalışma sürelerini, denemeleri, soru hedeflerini, konuları ve video planlarını takip eder.

## Özellikler

- **Çalışma alanı:** Pomodoro, kronometre, kesintisiz odak ve soru çözümü oturumları; sekme yenilendiğinde oturum kurtarma.
- **Deneme çözümü:** 80/180 dakika ve özel süre seçenekleri, kronometre, otomatik numaralı adlar, sekme kapandıktan sonra süreyi geri yükleme ve sonuç girişine geçiş.
- **Planlama:** Haftalık çalışma planı, günlük ve haftalık soru hedefleri, video ders takvimi ve aylık konu hedefleri.
- **Gelişim takibi:** Süreli ve süresiz soru çözümlerini birlikte gösteren çalışma geçmişi, ders dağılımı, deneme sonuçları, net değişimleri ve soru istatistikleri.
- **Konu yönetimi:** Kişisel listeler ve hesap bazında seçilen ortak AGS konuları.
- **Yönetim:** Kullanıcı yönetimi, izinlerle kontrol edilen aylık plan paylaşımı ve topluluk görünürlüğü.
- **Parçalı video izleme:** Tek videolu görevlerde 2, 3 veya 4 parçalı ilerleme; solda devam listesi ve tamamlanınca izlenen haftanın pazartesisine sabit 1 video kaydı.
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
npm run test:plans
npm run test:question-notes
```

Önceki sürümün aynı değişkenlerle üretilmiş `dist` klasörünü `PERF_BASELINE_DIST` ortam değişkeniyle verirseniz aynı gecikmeler altında önce/sonra karşılaştırması da yapılır. Bu testteki süreler canlı ağın veya Supabase sunucusunun performans garantisi değildir.

## Dağıtım

Cloudflare Git entegrasyonunda build komutu `npm run build`, çıktı klasörü `dist` olarak kullanılır. İki `VITE_SUPABASE_*` değişkeni hem production hem preview ortamının **build değişkenlerinde** tanımlanmalıdır. `wrangler.jsonc`, Workers üzerinde statik dosyaları ve SPA yönlendirmesini yapılandırır. Preview dalları üretimden ayrı incelenebilir.

## Veri ve yetkiler

`supabase/migrations/` altındaki SQL dosyaları ilgili özelliklerin şemasını, fonksiyonlarını ve RLS politikalarını içerir. Frontend dağıtımı bu SQL dosyalarını veritabanında otomatik çalıştırmaz. Yönetici parola işleminin kurulum ayrıntıları `supabase/functions/admin-change-password/README.md` içindedir.

Arayüz, mevcut oturum bilgisini kullanarak tekrar eden kimlik isteklerini azaltır; veri erişimini Supabase JWT ve RLS politikaları doğrular. Başarılı veri okumaları yalnızca açık sekmenin belleğinde kısa süre tutulur. Yazma işlemleri, hesap değişimi ve ilgili güncelleme olayları önbelleği temizler. Erişim kontrolü yapan RPC yanıtları kalıcı olarak önbelleğe alınmaz.

## Parçalı video için veritabanı güncellemesi

Bu branch'i canlıya almadan önce Supabase SQL Editor'de `supabase/migrations/video_watch_parts.sql` dosyasının tamamını çalıştırın. Mevcut planlar ve izlenme sayıları korunur. Cloudflare dağıtımı SQL dosyasını kendiliğinden çalıştırmaz.

Kısmi izleme hesapta saklanır; 1/2, 1/3 veya 1/4 izleme, izlenmiş video sayısına eklenmez. Tamamlandığında Türkiye saatine göre o haftanın pazartesisine 1 video yazılır ve önceki plan tarihi ayrıca korunur. Bu kayıt taşınamaz, düzenlenemez veya sıfırlanamaz; yalnızca uyarı onaylandıktan sonra silinir. Çok videolu görevler mevcut adet takibini kullanır.

`npm test`, migration'ı geçici PostgreSQL ortamında (PGlite) çalıştırarak hesap izinlerini, tekrar denemeleri, pazartesi kaydını ve değişiklik kilidini de doğrular; canlı veritabanına bağlanmaz.

## Cihazlarda açılma sorunu

Yeni yayın sonrası eski sayfa dosyalarının yüklenememesi için bir kez otomatik yenileme ve başlangıçta hata görünümü bulunur. HTML yeniden doğrulanır, içerik adı değişen Vite dosyaları uzun süre saklanır. Bu düzenlemeler tarayıcının DNS/SSL veya “siteye ulaşılamıyor” hatasını çözmez; o durumda kullanılan tam adres, hata kodu ve cihaz/ağ bilgisiyle Cloudflare alan adı erişimi incelenmelidir. Arayüzün kullandığı Tailwind 4 için Safari 16.4+, Chrome 111+ ve Firefox 128+ gerekir.

## Proje yapısı

| Dizin | İçerik |
| --- | --- |
| `src/pages` | İhtiyaç olduğunda yüklenen sayfalar |
| `src/components` | Ortak arayüz bileşenleri |
| `src/lib` | Veri erişimi, oturumlar, sayaçlar ve analizler |
| `supabase` | Veritabanı geçişleri ve Edge Function |
| `tests` | Hesap izolasyonu, veri doğruluğu, sayaç ve önbellek testleri |
| `public` | Kullanılan logo, favicon ve sayaç sesi |

### Soru planında konu / not

Bu özellik için `supabase/migrations/question_plans.sql` dosyasının **tamamını** Supabase SQL Editor’de çalıştırın. Güncelleme mevcut tablo ve kayıtları silmez; konu/not alanını ekler, farklı konuların ayrı hedeflerde tutulmasını sağlar ve kayıt fonksiyonlarını günceller. Aynı dosya tekrar çalıştırılabilir. Frontend dağıtımı SQL’i otomatik uygulamaz.

Hedef eklerken ve haftayı planlarken konu/not yazılabilir. Konu belirtilen hedefin manuel veya süreli çözümü yalnızca seçili hedefe kaydolur; konu bilgisi çözüm geçmişinde görünür ve sayaç kurtarmada korunur. Çözüm kaydı oluşan hedefin konu başlığı geçmişi korumak için değiştirilemez; başka konuya yeni hedef eklenir. Konu belirtilmeyen eski hedefler ve çözüm notları korunur.
