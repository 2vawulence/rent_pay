# Rent Pay — Gestion Locative, Réparations & Impôts Trimestriels

Application web de gestion de patrimoine immobilier et de suivi des loyers par site, des réparations et de la fiscalité foncière trimestrielle.

---

## 🏙️ Sites gérés

L'application centralise le suivi des loyers sur **5 sites** :
1. **Yopougon Studios** (`STUDIO N°1` à `STUDIO N°10`)
2. **Yopougon magasins** (`MAGASIN N°1` à `MAGASIN N°6`)
3. **Angré studios** (`STUDIO N°1` à `STUDIO N°10`)
4. **Yopougon Kotibet** (`VILLA`)
5. **Panneaux publicitaires sur la dalle de Yopougon** (`PANNEAU N°1`)

---

## ✨ Fonctionnalités principales

- **Vue récapitulative par zone** : Total à payer, montant payé, reste à payer et statut par site (mois sélectionné, cumul annuel ou année complète), avec bande de totaux globaux en bas de page.
- **Registre des loyers & Retrait en cas d'erreur de saisie** :
  - Encaissement des loyers (Orange Money, Wave, MTN MoMo, Moov Money, Espèces / Virement).
  - **Retrait / annulation d'un paiement** en un clic (`✕ Retirer paiement` / `✕ Retirer`) depuis la Vue par zone, le Registre des loyers, le Journal des paiements ou la Quittance du mois en cas d'erreur de saisie.
  - Édition de quittances de loyer imprimables (PDF) et génération de messages de relance.
- **Analyse & Différences Mois / Année** : Comparatif mensuel et annuel des loyers attendus, perçus et restes à recouvrer.
- **Suivi des retards** : Calcul automatique des jours de retard après la date d'échéance.
- **Réparations & Travaux** : Saisie des travaux à prévoir par logement, priorités (`Haute`, `Moyenne`, `Basse`), prestataires, coûts estimés et coûts réels.
- **Impôts trimestriels (T1 à T4)** : Suivi des montants à payer, déjà payés, restes à payer et calcul automatique des intérêts de retard au prorata temporis.
- **Saisie des montants des loyers & Gestion des baux** : Révision des loyers avec conservation de l'historique par période, ajout de logements et clôture/réactivation de bail.
- **Thème visuel** : Palette **Bleu Ciel & Blanc Marial 🙏🏻**.

---

## 🚀 Utilisation

1. Clonez le dépôt :
   ```bash
   git clone https://github.com/2vawulence/rent_pay.git
   ```
2. Ouvrez directement le fichier `index.html` dans votre navigateur web (Chrome, Edge, Firefox, Safari).

---

## 📁 Structure du projet

```text
├── index.html   # Interface principale (vues par zone, loyers, réparations, impôts, modales)
├── style.css    # Feuille de style (Thème Bleu Ciel & Blanc Marial)
├── app.js       # Logique métier, calculs financiers, quittances et persistance localStorage
├── .gitignore   # Fichiers exclus du suivi Git
└── README.md    # Documentation du projet
```

---

## 🔒 Sécurité

Application auditée avec [`cloudflare/security-audit-skill`](https://github.com/cloudflare/security-audit-skill) :
- Politique `Content-Security-Policy` intégrée dans `index.html`.
- Échappement systématique des entrées utilisateur (`esc()`) contre les injections DOM XSS.
- Validation stricte des schémas d'URL (`https://` / `http://`) pour les liens de géolocalisation.
- Aucun secret d'API stocké dans `localStorage`.
