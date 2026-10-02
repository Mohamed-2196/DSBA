# Logo files for Career Navigator

The Career Navigator page (`#/career`) has a slot for every employer and certificate. This folder is where the
official logo files go. Nothing in the code draws or imitates a logo: until a file is here, the slot shows a
neutral tile with the organisation's initials.

**33 slots: 26 employers and 7 certificates.** The same list is in `wanted.json` for scripts.

## Where the current files came from

All 33 were fetched on 2 October 2026 at the student rep's request, through the browser on his Mac, and are used
unmodified (only trimmed and resized) to identify each organisation next to the link to its own page. Every logo
belongs to its owner. Replace any file with one from the organisation's brand kit when you have it.

- **From the organisation's own website:** SICO (sicobank.com), BENEFIT (benefit.bh), Al Salam Bank
  (alsalambank.com), Bahrain Islamic Bank (bisb.com), Bahrain EDB (bahrainedb.com).
- **From Wikipedia / Wikimedia Commons** (the logo shown in each organisation's article): National Bank of Bahrain,
  Citi, Investcorp, Central Bank of Bahrain, PwC, stc, Mumtalakat, Bapco Energies, KPMG, Bahrain Bourse, Gulf
  International Bank, Deloitte, Batelco, EY, McKinsey & Company, Amazon Web Services, Zain, Kuwait Finance House,
  Bank ABC, BBK, Alba, CFA Institute, GARP, Microsoft Power BI, Google, Tableau, Bloomberg.
- They are screen captures of those images at about 380 px wide: sharp at tile size, a little soft if enlarged.

## How to supply a file

1. Get the official logo from the organisation itself (its brand or media page, or ask its communications team).
   Check its brand guidelines allow this use.
2. Save it as a **PNG** with the exact file name from the tables below (lowercase, as written).
3. Put it in `public/logos/employers/` or `public/logos/certs/`.
4. Reload the page. The slot picks the file up on its own; no code change is needed.

## What works best

- The slot is a white rounded tile, **176 × 80 px** on screen, with padding. The logo is fitted inside without
  cropping or stretching, so wide wordmarks and square badges both work.
- Export at about **3× that size** (roughly 400 px wide for a wordmark, 200 px tall for a square badge) so it stays
  sharp on a projector.
- Use the version made for a **white or light background**, ideally with a transparent background. The tile stays
  white in the dark theme too, so the light-background version is the only one needed.
- Trim empty space around the mark. The tile adds its own padding.

## Employers (`public/logos/employers/`)

| File | Organisation |
| --- | --- |
| `employers/nbb.png` | National Bank of Bahrain |
| `employers/citi.png` | Citi |
| `employers/investcorp.png` | Investcorp |
| `employers/cbb.png` | Central Bank of Bahrain |
| `employers/pwc.png` | PwC Middle East |
| `employers/stc-bahrain.png` | stc Bahrain |
| `employers/mumtalakat.png` | Mumtalakat |
| `employers/bapco-energies.png` | Bapco Energies |
| `employers/sico.png` | SICO |
| `employers/kpmg.png` | KPMG in Bahrain |
| `employers/bahrain-bourse.png` | Bahrain Bourse |
| `employers/benefit.png` | BENEFIT |
| `employers/gib.png` | Gulf International Bank |
| `employers/deloitte.png` | Deloitte Middle East |
| `employers/bahrain-edb.png` | Bahrain EDB |
| `employers/batelco.png` | Batelco |
| `employers/ey.png` | EY |
| `employers/mckinsey.png` | McKinsey & Company |
| `employers/aws.png` | Amazon Web Services |
| `employers/zain-bahrain.png` | Zain Bahrain |
| `employers/al-salam-bank.png` | Al Salam Bank |
| `employers/kfh-bahrain.png` | Kuwait Finance House Bahrain |
| `employers/bisb.png` | Bahrain Islamic Bank |
| `employers/bank-abc.png` | Bank ABC |
| `employers/bbk.png` | BBK |
| `employers/alba.png` | Alba |

## Certificates and courses (`public/logos/certs/`)

| File | Organisation |
| --- | --- |
| `certs/cfa.png` | CFA Institute (CFA Program card, and the CFA Institute Research Challenge card beside the page title) |
| `certs/frm.png` | GARP, the FRM (Financial Risk Manager) mark |
| `certs/pl300.png` | Microsoft (Power BI Data Analyst, PL-300) |
| `certs/aws-ccp.png` | Amazon Web Services (AWS Certified Cloud Practitioner badge) |
| `certs/google-da.png` | Google (Google Data Analytics Certificate) |
| `certs/tableau.png` | Tableau |
| `certs/bmc.png` | Bloomberg (Bloomberg Market Concepts) |

"SQL practice" has no issuer, so it has no logo slot (it shows a generic icon).

## If the list changes

File names come from the ids in `src/features/career/data/employers.js` and `src/features/career/data/certificates.js`.
Add an employer or a certificate there, and add its row here and in `wanted.json`.
