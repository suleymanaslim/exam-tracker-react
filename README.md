# 🎓 YKS & DGS Sınav Takip ve Pomodoro Çalışma Asistanı

Gelişmiş YKS (TYT, AYT, YDT), DGS ve LGS sınav hazırlık platformu. Ders takip, soru çözümü, net hesaplama, zamanlayıcı (Pomodoro & Manuel Oturum Ekleme), kelime öğrenme ve detaylı istatistik analizleri içerir.

![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38BDF8?style=for-the-badge&logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase)

---

## 🚀 Özellikler

- **📊 Dashboard & Sayaç**: Sınava kalan süreyi geri sayım ile anlık takip edin.
- **⏱️ Pomodoro & Manuel Oturum**:
  - Gelişmiş Pomodoro ve Kronometre modları.
  - Sınav, ders, kaynak, süre, tarih ve not girerek **Manuel Çalışma Oturumu Ekleme**.
- **📝 Soru Takibi & Konu Yönetimi**: TYT, AYT, YDT ve DGS için konu takibi, çözülen soru sayısı ve doğru/yanlış/boş kayıtları.
- **📈 İstatistik ve Grafik Analizleri**: Haftalık/aylık çalışma süreleri, ders bazlı dağılım ve gelişmiş çalışma analizleri.
- **🔤 YKS Kelime Çalışma (YDT & İngilizce)**:
  - Flashcard kart sistemi.
  - Öğrenildi / Tekrar Et işaretleme.
  - Sadece **Yöneticilere (Admin)** özel kelime ekleme, düzenleme ve yönetim paneli.
- **📱 %100 Mobil Uyumlu**: Mobil cihazlarda kusursuz çalışan modern alt navigasyon ve responsive arayüz.

---

## 🛠️ Teknolojiler

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts
- **Durum Yönetimi**: Zustand
- **Backend & Database**: Supabase (PostgreSQL, Row Level Security)
- **Dağıtım**: Netlify / Vercel

---

## 📦 Kurulum ve Çalıştırma

### 1. Depoyu klonlayın
```bash
git clone https://github.com/KULLANICI_ADI/exam-tracker-react.git
cd exam-tracker-react
```

### 2. Bağımlılıkları yükleyin
```bash
npm install
```

### 3. Çevre Değişkenlerini Oluşturun
`.env.example` dosyasını `.env.local` olarak kopyalayın ve Supabase bilgilerinizi girin:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Geliştirme Sunucusunu Başlatın
```bash
npm run dev
```

---

## 🗄️ Veritabanı Kurulumu (Supabase)

Supabase projenizin SQL editöründe `supabase/migrations/` altındaki SQL migration dosyalarını çalıştırarak gerekli tabloları oluşturabilirsiniz:

1. `admin_setup.sql`
2. `exam_date.sql`
3. `exam_question_count.sql`
4. `exam_results.sql`
5. `system_settings.sql`
6. `topics.sql`

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) altında lisanslanmıştır.
