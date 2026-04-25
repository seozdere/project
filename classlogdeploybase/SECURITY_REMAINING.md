# Kalan Sunucu Tarafi Guvenlik Isleri

Bu repoda parent link akisi artik kalici link kodunu kisa omurlu parent session'a ceviren modele tasindi. Uretimden once Supabase tarafinda `supabase/migrations/001_parent_link_sessions.sql` uygulanmali.

## 1. Parent link session migration

- `cl_get_parent_link_v2` ogretmen oturumunu mevcut `cl_get_parent_link` RPC'siyle dogrular.
- Veliye paylasilan URL artik `parent.html?link=...` formatindadir.
- `cl_parent_exchange_link` bu linki 10 dakikalik gecici `session_token` degerine cevirir.
- `cl_get_parent_view_v2` sadece gecici session ile veri dondurur.
- Linkler iptal/rotate edilebilir; sessionlar suresi dolunca gecersiz olur.

## 2. Login rate limit mutlaka sunucuda olmali

- `supabase/migrations/002_auth_audit_support.sql` yardimci tablo/fonksiyonlari ekler.
- `cl_authenticate` fonksiyonu bu yardimcilari cagirarak IP, username ve cihaz karmasi bazinda throttle uygulamali.
- Basarisiz denemeler audit log'a yazilmali.
- Belirli esikten sonra gecici kilit ve artan gecikme uygulanmali.

## 3. Board/kiosk akisi kapali kalmali

- `secureBoardPairingEnabled` uretimde `false` kalmali.
- Realtime broadcast ile token gonderen eski board yolu private nonce tabanli sunucu tasarimina gecmeden acilmamali.

## 4. Realtime kanallari private ve yetkili olmali

- Supabase Realtime public channel kullanimi hassas token tasimamalidir.
- `realtime.messages` icin topic bazli RLS politikasi yazilmali.
- Board/kiosk yeniden acilacaksa `config: { private: true }` modeli benimsenmeli.

## 5. Hassas aksiyonlarda yeniden dogrulama

- `cl_change_password` mevcut sifre veya step-up auth istemeli.
- Ogretmen ekleme/silme ve ayar degisikligi gibi admin islemleri audit log'a gitmeli.
