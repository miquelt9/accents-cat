# Catalan Speech Dataset Audit

This report is generated from bounded streaming samples. Counts are exact only up to the scanned row limit.

## projecte-aina/annotated_catalan_common_voice_v17

- Planned role: primary supervised candidate
- Audited config: `default`
- Available configs: default
- Errors: annotated_train: ValueError: Bad split: annotated_train. Available splits: ['validation', 'invalidated', 'other', 'test', 'train', 'validated']; annotated_dev: ValueError: Bad split: annotated_dev. Available splits: ['validation', 'invalidated', 'other', 'test', 'train', 'validated']; annotated_test: ValueError: Bad split: annotated_test. Available splits: ['validation', 'invalidated', 'other', 'test', 'train', 'validated']

## projecte-aina/commonvoice_benchmark_catalan_accents

- Planned role: held-out benchmark candidate
- Audited config: `default`
- Available configs: default
- Errors: balearic_female: ValueError: Bad split: balearic_female. Available splits: ['train', 'balearic_fem', 'balearic_male', 'central_female', 'central_male', 'northern_female', 'northern_male', 'northwestern_female', 'northwestern_male', 'valencian_female', 'valencian_male']; balearic_male: RemoteEntryNotFoundError: 404 Client Error. (Request ID: Root=1-6a41981f-14c3a8b77bb66fe03aaeeced;fb842a40-d64b-4f3f-9581-e38b1d60f689)

Entry Not Found for url: https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0/resolve/main/audio/ca/validated/ca_validated_0.tar.; central_female: RemoteEntryNotFoundError: 404 Client Error. (Request ID: Root=1-6a419822-29127c3347433a1b65a676dc;c0f6c5a0-7c60-4add-b44a-7217efbabec1)

Entry Not Found for url: https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0/resolve/main/audio/ca/validated/ca_validated_0.tar.; central_male: RemoteEntryNotFoundError: 404 Client Error. (Request ID: Root=1-6a419825-64181cd1357624c71b5db645;f42057db-5a07-46a0-a5a6-7d44b464ca8f)

Entry Not Found for url: https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0/resolve/main/audio/ca/validated/ca_validated_0.tar.; northern_female: RemoteEntryNotFoundError: 404 Client Error. (Request ID: Root=1-6a419828-604988fc3d71aea14e0026d5;61bb001c-943c-45ed-9e95-3b32115d850c)

Entry Not Found for url: https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0/resolve/main/audio/ca/validated/ca_validated_0.tar.; northern_male: RemoteEntryNotFoundError: 404 Client Error. (Request ID: Root=1-6a41982b-3371c27d19812ea77fac277c;0ed3e8b5-d238-40be-99cc-29665965f9d7)

Entry Not Found for url: https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0/resolve/main/audio/ca/validated/ca_validated_0.tar.; northwestern_female: RemoteEntryNotFoundError: 404 Client Error. (Request ID: Root=1-6a41982e-3dc5003f271233de0f47e071;e69c9304-e8a3-4307-bce6-58070011cf27)

Entry Not Found for url: https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0/resolve/main/audio/ca/validated/ca_validated_0.tar.; northwestern_male: RemoteEntryNotFoundError: 404 Client Error. (Request ID: Root=1-6a419831-55f4390a3e4ae05108895b62;f0123952-ca1d-44f9-98ec-f42a91f723f4)

Entry Not Found for url: https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0/resolve/main/audio/ca/validated/ca_validated_0.tar.; valencian_female: RemoteEntryNotFoundError: 404 Client Error. (Request ID: Root=1-6a419834-3d62b1bf65b8b2081cfcb275;2b29c430-ebef-48a5-9491-20a0ac168240)

Entry Not Found for url: https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0/resolve/main/audio/ca/validated/ca_validated_0.tar.; valencian_male: RemoteEntryNotFoundError: 404 Client Error. (Request ID: Root=1-6a419837-02ce99fe488362522445ecf8;42fb158b-5074-4fb5-a85d-2070e850af62)

Entry Not Found for url: https://huggingface.co/datasets/mozilla-foundation/common_voice_17_0/resolve/main/audio/ca/validated/ca_validated_0.tar.

## projecte-aina/LaFrescat

- Planned role: tiny clean sanity check
- Audited config: `default`
- Available configs: default
- Errors: train: TypeError: Pickler._batch_setitems() takes 2 positional arguments but 3 were given
