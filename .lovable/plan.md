

# Sistemul Retail Cesar's — MVP Faza 1

## POS + Produse + Gestiune Stoc

### 1. Schema Bază de Date & Securitate (Lovable Cloud / Supabase)
- **Tabel produse**: base_id, nume, categorie, brand, preț_vânzare, preț_achiziție, stoc_general, tag_sezon, activ, taguri, imagini, created_at
- **Tabel variante**: base_id (FK), cod_variantă (2 cifre), etichetă (ex: "50", "M"), stoc_variantă
- **Tabel utilizatori**: user_id, rol (admin/casier/depozit), cod_card_angajat, pin_scoatere, nume
- **Tabel dispozitive**: cod_dispozitiv, nume, roluri_permise, activ
- **Tabel vânzări**: id_intern (CES-XXXXXX), casier_id, status (pending_fiscal/fiscalizat), total, total_reducere, metoda_plată, nr_bon_fiscal, created_at
- **Tabel articole vânzare**: vânzare_id (FK), base_id produs, cod_variantă, cantitate, preț_unitar, procent_reducere, total_linie
- **Tabel scoateri stoc**: user_id, base_id produs, cod_variantă, cantitate, motiv, timestamp
- **Tabel config coduri de bare**: versiune format, format_dată, lungimi active
- **Tabel buline (comisioane)**: culoare, hex, valoare_comision_ron, activ
- **Tabel atribuiri buline**: base_id produs, bulina_id
- **Tabel log comisioane**: vânzare_id, casier_id, sumă_ron, bulina_id
- **Tabel clienți** (doar structura): telefon (unic), nume, email, cod_card, puncte, nivel
- **Tabel target-uri** (doar structura): tip, valoare, perioadă, activ
- Politici RLS pe bază de rol
- Validare cod dispozitiv

### 2. Motor Parsare Coduri de Bare
- Parser configurabil: detectare automată 17 cifre (V1) vs 19 cifre (V2)
- Extrage: base_id, cod_variantă (doar V2), dată_intrare, preț_etichetă
- Format dată configurabil (ZZLLAA sau AALLZZ)
- Returnează obiect structurat pentru POS și recepție

### 3. Administrare Produse (Admin)
- Lista produse cu căutare, filtrare pe categorie/brand/sezon/status
- Formular creare/editare produs: toate câmpurile, upload imagini în Supabase Storage
- Gestionare variante: adaugă/editează/șterge mărimi per produs
- Import în masă (CSV)
- Generare coduri de bare pentru produse noi (V1 și V2)
- Dezactivare automată produse fără recepție 6 luni
- Preț achiziție vizibil doar pentru admin

### 4. Interfața POS
- **Stare implicită**: mod PUBLIC — doar căutare + vizualizare (nume, preț, imagine, stoc)
- **Input scanare card**: câmp focusat permanent; scanarea cardului de angajat activează sesiunea CASIER
- **Coș**: scanare produs = adăugare instantanee; focus revine automat la input scanare
- **Acțiuni articol**: ștergere articol (un click), reducere manuală (max 20%, slider sau input)
- **Avertismente stoc**: indicator vizual subtil când stocul ajunge la 0 sau negativ — nu blochează vânzarea
- **Buton Anulare Vânzare**: golește coșul, fără scriere în BD, revine la mod PUBLIC
- **Finalizare în Sistem**: creează înregistrare vânzare (CES-XXXXXX), scade stocul, status = PENDING_FISCAL, revine la PUBLIC
- **Buton bon fiscal**: placeholder — introducere manuală nr. bon fiscal deocamdată
- **Auto-blocare**: 10 min inactivitate → revenire la mod PUBLIC
- **Căutare produs**: căutare rapidă după nume (scenariu fără cod de bare)
- **Selector metodă plată**: Numerar / Card / Mixt (sume împărțite)
- **Articole cadou**: marchează articol ca gift → reducere 100%

### 5. Recepție Marfă
- Grilă de introducere în masă (tip spreadsheet)
- Câmpuri per rând: cod de bare (sau căutare produs), cantitate, preț_achiziție, defalcare pe variante
- Acceptă coduri existente (V1/V2) sau selectare manuală produs
- Reactivare automată produse inactive la recepție nouă
- Generare coduri de bare noi dacă e necesar
- Preț achiziție vizibil doar admin

### 6. Scoatere Stoc
- Flux rapid: scanare card angajat → introducere PIN personal → scanare/căutare produs → cantitate → motiv opțional → confirmare
- Înregistrat cu user_id, timestamp, produs, cantitate, motiv
- NU apare ca vânzare

### 7. Dashboard Casier
- Sumar zilnic simplu: total vânzări (RON), număr bonuri, comision acumulat
- Fără detalii pe produs, fără profit

### 8. Dashboard Admin (de bază)
- Prezentare vânzări: totaluri azi/săptămână/lună, număr bonuri
- Prezentare stoc: total produse, alerte stoc scăzut
- Gestionare angajați: adaugă/editează carduri, roluri, PIN-uri
- Gestionare coduri dispozitive: înregistrare dispozitive, atribuire roluri
- Setări buline/comisioane: definire culori, valori, atribuire la produse
- Lista vânzări pending fiscal (placeholder reîncercare)
- Export orice tabel în CSV

### 9. Interfață & Branding
- Temă întunecată premium cu accente aurii (branding Cesar's placeholder)
- Layout responsive: optimizat pentru POS desktop (butoane mari, prietenos scanare), pregătit pentru tabletă
- Tranziții rapide, animații minime pentru viteză POS
- Navigare sidebar: POS / Produse / Recepție / Scoatere Stoc / Admin

### 10. Optimizări Performanță
- Căutare indexată produse (index la nivel de bază de date)
- Cache local produse pentru POS (React Query cu cache agresiv)
- Actualizări optimiste stoc în coș
- Liste produse paginate cu scroll virtual pentru cataloage mari

