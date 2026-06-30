# Word Candidate Analysis

This report mines manifest sentences to guide fixed-script design. It should not be used as a lexical dialect classifier.

## Broad-Coverage Words

Words here occur across all five labels and many speakers. They are good candidates for natural script wording if they also contain useful phonetic contexts.

- `anar`: speakers=116, counts={'balearic': 27, 'central': 33, 'northern': 35, 'northwestern': 35, 'valencian': 32}, speaker_counts={'balearic': 21, 'central': 25, 'northern': 25, 'northwestern': 25, 'valencian': 20}
- `seu`: speakers=94, counts={'balearic': 16, 'central': 29, 'northern': 20, 'northwestern': 25, 'valencian': 22}, speaker_counts={'balearic': 13, 'central': 26, 'northern': 14, 'northwestern': 22, 'valencian': 19}
- `vint-i`: speakers=75, counts={'balearic': 24, 'central': 22, 'northern': 17, 'northwestern': 15, 'valencian': 15}, speaker_counts={'balearic': 17, 'central': 18, 'northern': 12, 'northwestern': 14, 'valencian': 14}
- `tres`: speakers=73, counts={'balearic': 24, 'central': 17, 'northern': 17, 'northwestern': 17, 'valencian': 13}, speaker_counts={'balearic': 19, 'central': 15, 'northern': 12, 'northwestern': 15, 'valencian': 12}
- `seva`: speakers=72, counts={'balearic': 10, 'central': 25, 'northern': 15, 'northwestern': 21, 'valencian': 18}, speaker_counts={'balearic': 9, 'central': 19, 'northern': 12, 'northwestern': 17, 'valencian': 15}
- `sant`: speakers=58, counts={'balearic': 14, 'central': 21, 'northern': 16, 'northwestern': 10, 'valencian': 10}, speaker_counts={'balearic': 11, 'central': 13, 'northern': 15, 'northwestern': 9, 'valencian': 10}
- `molt`: speakers=56, counts={'balearic': 10, 'central': 15, 'northern': 11, 'northwestern': 10, 'valencian': 13}, speaker_counts={'balearic': 9, 'central': 14, 'northern': 11, 'northwestern': 9, 'valencian': 13}
- `dos`: speakers=54, counts={'balearic': 14, 'central': 11, 'northern': 13, 'northwestern': 9, 'valencian': 13}, speaker_counts={'balearic': 12, 'central': 8, 'northern': 13, 'northwestern': 8, 'valencian': 13}

## Label-Distinctive Words For Manual Review

These can reveal useful lexical/phonetic material, but they can also be topic artifacts. Review manually before using them in a fixed script.

### `balearic`

- `som`: score=1.9064, label_count=7, other_count=2, label_speakers=6
- `tan`: score=0.6743, label_count=6, other_count=8, label_speakers=6
- `biblioteca`: score=0.5201, label_count=9, other_count=14, label_speakers=8
- `maig`: score=0.3755, label_count=14, other_count=25, label_speakers=11
- `anirà`: score=0.3309, label_count=15, other_count=28, label_speakers=12
- `planta`: score=0.297, label_count=7, other_count=14, label_speakers=7
- `iran`: score=0.2324, label_count=15, other_count=31, label_speakers=9
- `d'octubre`: score=0.188, label_count=10, other_count=22, label_speakers=10
- `diumenge`: score=0.1718, label_count=7, other_count=16, label_speakers=7
- `pel`: score=0.1583, label_count=12, other_count=27, label_speakers=11
- `irà`: score=0.1454, label_count=10, other_count=23, label_speakers=7
- `estat`: score=0.1271, label_count=8, other_count=19, label_speakers=8
- `d'excursió`: score=0.1146, label_count=7, other_count=17, label_speakers=6
- `encara`: score=0.0989, label_count=6, other_count=15, label_speakers=6
- `d'agost`: score=0.0783, label_count=8, other_count=20, label_speakers=8
- `molts`: score=0.0606, label_count=7, other_count=18, label_speakers=7
- `han`: score=0.0317, label_count=8, other_count=21, label_speakers=7
- `però`: score=0.0227, label_count=14, other_count=36, label_speakers=13

### `central`

- `feina`: score=1.0038, label_count=7, other_count=5, label_speakers=7
- `bona`: score=0.9674, label_count=8, other_count=6, label_speakers=8
- `primers`: score=0.8703, label_count=6, other_count=5, label_speakers=6
- `poc`: score=0.8339, label_count=8, other_count=7, label_speakers=7
- `qualsevol`: score=0.7161, label_count=6, other_count=6, label_speakers=6
- `castell`: score=0.7161, label_count=6, other_count=6, label_speakers=6
- `estava`: score=0.5983, label_count=7, other_count=8, label_speakers=7
- `zero`: score=0.562, label_count=11, other_count=13, label_speakers=9
- `principal`: score=0.4648, label_count=6, other_count=8, label_speakers=6
- `després`: score=0.4139, label_count=16, other_count=22, label_speakers=15
- `tenir`: score=0.2461, label_count=9, other_count=15, label_speakers=8
- `ela`: score=0.2306, label_count=7, other_count=12, label_speakers=6
- `estan`: score=0.1771, label_count=6, other_count=11, label_speakers=6
- `diversos`: score=0.1771, label_count=6, other_count=11, label_speakers=6
- `només`: score=0.1696, label_count=10, other_count=18, label_speakers=8
- `dona`: score=0.1565, label_count=7, other_count=13, label_speakers=7
- `tenen`: score=0.1283, label_count=9, other_count=17, label_speakers=9
- `diu`: score=0.1283, label_count=9, other_count=17, label_speakers=9
- `forma`: score=0.1183, label_count=10, other_count=19, label_speakers=9
- `fer`: score=0.0904, label_count=22, other_count=42, label_speakers=19
- `número`: score=0.0695, label_count=21, other_count=41, label_speakers=18
- `d'anar`: score=0.023, label_count=18, other_count=37, label_speakers=17
- `molts`: score=0.023, label_count=8, other_count=17, label_speakers=8
- `meu`: score=0.023, label_count=7, other_count=15, label_speakers=7

### `northern`

- `algunes`: score=1.0768, label_count=7, other_count=6, label_speakers=6
- `morir`: score=0.692, label_count=6, other_count=8, label_speakers=6
- `nom`: score=0.5125, label_count=12, other_count=19, label_speakers=12
- `erra`: score=0.4733, label_count=9, other_count=15, label_speakers=7
- `mai`: score=0.4578, label_count=7, other_count=12, label_speakers=7
- `persones`: score=0.4578, label_count=7, other_count=12, label_speakers=6
- `casa`: score=0.1811, label_count=6, other_count=14, label_speakers=6
- `volen`: score=0.1483, label_count=13, other_count=30, label_speakers=7
- `quatre`: score=0.1166, label_count=6, other_count=15, label_speakers=6

### `northwestern`

- `s'ha`: score=0.7995, label_count=8, other_count=8, label_speakers=6
- `pedra`: score=0.6941, label_count=8, other_count=9, label_speakers=8
- `diferents`: score=0.5763, label_count=7, other_count=9, label_speakers=7
- `passatge`: score=0.5763, label_count=7, other_count=9, label_speakers=7
- `hora`: score=0.4428, label_count=6, other_count=9, label_speakers=6
- `primer`: score=0.3641, label_count=10, other_count=16, label_speakers=10
- `seves`: score=0.2016, label_count=10, other_count=19, label_speakers=10
- `totes`: score=0.1709, label_count=7, other_count=14, label_speakers=6
- `poden`: score=0.1635, label_count=8, other_count=16, label_speakers=7
- `d'any`: score=0.1063, label_count=7, other_count=15, label_speakers=6
- `durant`: score=0.1063, label_count=10, other_count=21, label_speakers=9
- `mai`: score=0.1063, label_count=6, other_count=13, label_speakers=6
- `quina`: score=0.0773, label_count=16, other_count=34, label_speakers=14

### `valencian`

- `bitllet`: score=1.0442, label_count=8, other_count=6, label_speakers=7
- `dura`: score=1.0442, label_count=8, other_count=6, label_speakers=7
- `quant`: score=0.7929, label_count=7, other_count=7, label_speakers=6
- `home`: score=0.6751, label_count=7, other_count=8, label_speakers=7
- `viu`: score=0.3874, label_count=7, other_count=11, label_speakers=6
- `qui`: score=0.3409, label_count=13, other_count=21, label_speakers=9
- `dia`: score=0.2821, label_count=8, other_count=14, label_speakers=7
- `plaça`: score=0.2333, label_count=7, other_count=13, label_speakers=7
- `havia`: score=0.1738, label_count=6, other_count=12, label_speakers=6
- `totes`: score=0.1643, label_count=7, other_count=14, label_speakers=7
- `cinc`: score=0.1463, label_count=10, other_count=20, label_speakers=10
- `tren`: score=0.0997, label_count=10, other_count=21, label_speakers=9
- `pels`: score=0.0997, label_count=9, other_count=19, label_speakers=9
- `fou`: score=0.0307, label_count=6, other_count=14, label_speakers=6
