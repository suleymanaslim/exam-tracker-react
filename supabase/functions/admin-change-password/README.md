# Admin kullanıcı şifresi değiştirme

Frontend bu fonksiyonu `supabase.functions.invoke('admin-change-password')` ile çağırır. Web sitesine push etmek Supabase fonksiyonunu dağıtmaz.

## Supabase Dashboard ile kurulum

1. Projende **Edge Functions → Deploy a new function → Via Editor** aç.
2. Fonksiyon adı tam olarak **admin-change-password** olsun.
3. Bu klasördeki `index.ts` içeriğini editördeki `index.ts` dosyasına yapıştır. Aynı klasörde `handler.ts` isimli dosyayı ekleyip içeriğini yapıştır. `README.md` dosyasını eklemek gerekmez.
4. Fonksiyonun **Verify JWT** / **Enforce JWT Verification** ayarını kapat. Kimlik doğrulama kaldırılmıyor: kod her istekte `auth.getUser(token)` ile oturumu doğrular ve veritabanındaki `profiles.role` değerinin `admin` olmasını zorunlu tutar. Bu, eski ve yeni JWT imzalama anahtarlarıyla çalışır.
5. **Deploy function** ile dağıt. Supabase’in varsayılan `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` ortam değişkenleri kullanılır; ayrıca yeni API anahtarları varsa `SUPABASE_SECRET_KEYS.default` desteklenir. Bu anahtarları Vite/Cloudflare frontend değişkenlerine ekleme.
6. Sitede kendi admin hesabınla **Admin → kullanıcı → Şifre değiştir** yolunu kullan.

## CLI ile alternatif

Repo kökünde:

```sh
npx supabase login
npx supabase functions deploy admin-change-password --project-ref PROJE_REFERANSI --no-verify-jwt
```

`PROJE_REFERANSI` yerine Supabase proje referansını yaz. Repo içindeki `supabase/config.toml` aynı JWT ayarını içerir.

## Yetki modeli

İstek yapan kişi tarayıcıdaki admin durumundan veya body içinden alınmaz; Supabase Auth tarafından doğrulanan kullanıcıdır. `profiles` tablosunda `admin` rolü bulunmalıdır. Hedef hesabın rolü `user` olmalıdır; admin ve kişinin kendi hesabı bu alandan değiştirilemez. Şifre 8–128 karakter olmalı; Supabase'in daha güçlü parola koşulları da uygulanır. Şifre loglanmaz veya yanıt içinde dönmez.

Önceden sağlanan `supabase/migrations/admin_read_access.sql` uygulanmış olmalıdır. İçindeki `protect_profile_role` tetikleyicisi kullanıcıların kendilerine admin rolü vermesini engeller. Bu özellik için auth.users tablosunda elle UPDATE veya veri silen SQL çalıştırma gerekmez.

Kaynaklar: https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid ve https://supabase.com/docs/guides/functions/quickstart-dashboard

Doğrulama: `node --experimental-strip-types --test tests/adminPassword.test.mjs` kimlik/yetki, hedef rolü, giriş doğrulama ve hata durumlarını sahte backend ile test eder. Canlı kullanıcı şifrelerini değiştirmez.
