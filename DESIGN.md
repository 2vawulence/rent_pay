# Rent Pay — Design System (`DESIGN.md`)

> Basé sur **[Ramp — Editorial finance desk](https://styles.refero.design/style/b38702a0-75ab-474c-9106-00b624535825)** (`styles.refero.design`), adapté en **Blanc Pur & Bleu Ciel / Marial 🙏🏻**.

## 1. Philosophie Visuelle ("Editorial Finance Desk — Édition Blanc & Bleu")
- **Surface éditoriale sans ombres portées** : L'élévation repose exclusivement sur des bordures fines de `1px` (`--border: #cfe2f5`) et des contrastes de surface (`#f2f7fc` Canvas → `#ffffff` Carte → `#e8f2fc` Wash → `#0a223d` Bandeau inversé).
- **Signal chromatique unique (Bleu Ciel)** : Le bleu ciel vif (`#0284c7` / `#38bdf8`) remplace le surligneur de Ramp pour signaler chaque action financière (encaissement de loyer, onglet actif, indicateur de recouvrement).
- **Typographie néo-grotesque à graisse maîtrisée** : Police `Inter` (`font-feature-settings: "ss01" on`) en graisse régulière (`400`/`500`) où la hiérarchie s'exprime par la taille, l'interlignage serré sur les titres (`1.15`, `letter-spacing: -0.025em`) et l'espacement aéré sur les micro-labels majuscules (`0.65rem`, `letter-spacing: 0.05em`).
- **Alignement tabulaire comptable** : Tous les montants FCFA, totaux par zone, restes à payer et impôts trimestriels utilisent `font-variant-numeric: tabular-nums` et `JetBrains Mono`.

## 2. Tokens de Couleurs (Blanc & Bleu)

| Rôle | Token CSS | Valeur Hex | Description |
|------|-----------|------------|-------------|
| Canvas (Fond de page) | `--bg` | `#f2f7fc` | Blanc glacé très doux (équivalent *Bone* en teinte céleste) |
| Paper (Carte) | `--bg-card` | `#ffffff` | Blanc pur pour les cartes principales, tableaux et modales |
| Wash (Surface secondaire) | `--bg-elevated` | `#e8f2fc` | Lavis bleu ciel très pâle pour les sous-cartes et entêtes de zones |
| Inverted (Bandeau Totaux) | `--surface-inverted` | `#0a223d` | Bleu Marial profond pour le bandeau des totaux en bas de page |
| Hairline Border | `--border` | `#cfe2f5` | Bordure structurelle `1px` (remplace `box-shadow`) |
| Primary Signal | `--primary` | `#0284c7` | Bleu ciel principal pour les boutons d'action et états actifs |
| Marian Ink | `--text` | `#081c33` | Texte principal à très fort contraste |
| Ash | `--text-muted` | `#567699` | Légendes, en-têtes de colonnes et micro-labels |

## 3. Rayons de Bordure (Échelle Stricte Ramp)
- **Cartes de contenu (`.card`, `.modal-box`, `.tenant-card`)** : `16px` (`--radius-card`)
- **Cartes secondaires / Wash (`.kpi-card`, `.quarter-card`)** : `12px` (`--radius`)
- **Champs de saisie (`.input-field`, `.period-selector`)** : `10px` (`--radius-input`)
- **Boutons & Badges (`.btn`, `.badge`, `.kpi-tag`, `.unit-no`)** : `6px` (`--radius-sm`)
