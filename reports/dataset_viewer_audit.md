# Hugging Face Dataset Viewer Audit

This report uses the Dataset Viewer API and does not execute local dataset scripts.

## projecte-aina/annotated_catalan_common_voice_v17
- Error: `{'ok': False, 'status_code': 500, 'url': 'https://datasets-server.huggingface.co/splits?dataset=projecte-aina%2Fannotated_catalan_common_voice_v17', 'error': {'error': 'Cannot get the config names for the dataset.', 'cause_exception': 'RuntimeError', 'cause_message': 'Dataset scripts are no longer supported, but found annotated_catalan_common_voice_v17.py', 'cause_traceback': ['Traceback (most recent call last):\n', '  File "/src/services/worker/src/worker/job_runners/dataset/config_names.py", line 66, in compute_config_names_response\n    config_names = get_dataset_config_names(\n', '  File "/src/services/worker/.venv/lib/python3.9/site-packages/datasets/inspect.py", line 161, in get_dataset_config_names\n    dataset_module = dataset_module_factory(\n', '  File "/src/services/worker/.venv/lib/python3.9/site-packages/datasets/load.py", line 1031, in dataset_module_factory\n    raise e1 from None\n', '  File "/src/services/worker/.venv/lib/python3.9/site-packages/datasets/load.py", line 989, in dataset_module_factory\n    raise RuntimeError(f"Dataset scripts are no longer supported, but found {filename}")\n', 'RuntimeError: Dataset scripts are no longer supported, but found annotated_catalan_common_voice_v17.py\n']}}`

## projecte-aina/commonvoice_benchmark_catalan_accents
- Error: `{'ok': False, 'status_code': 501, 'url': 'https://datasets-server.huggingface.co/splits?dataset=projecte-aina%2Fcommonvoice_benchmark_catalan_accents', 'error': {'error': "The dataset viewer doesn't support this dataset because it runs arbitrary Python code. You can convert it to a Parquet data-only dataset by using the convert_to_parquet CLI from the datasets library. See: https://huggingface.co/docs/datasets/main/en/cli#convert-to-parquet"}}`

## projecte-aina/LaFrescat
### `default` / `train`
- Viewer examples: None
- Columns: `['audio', 'transcription', 'speaker_id', 'accent']`
- First row preview: `{'transcription': 'Una mica més amunt, un cop passats els blocs de pisos, hi havia una altra casa de dos o tres pisos en la que plantaven floretes petites blanques.', 'speaker_id': 'grau', 'accent': 'central'}`

## softcatala/catalan-youtube-speech
### `default` / `train`
- Viewer examples: None
- Columns: `['clip_id', 'source_id', 'duration', 'start', 'end', 'gender', 'candidate_1', 'candidate_2', 'yt_url', 'license']`
- First row preview: `{'clip_id': '000004ce-9e4e-4c08-8b7f-2049f69539bb', 'source_id': '767322d0-4afd-4a9b-a6ea-d615f406857b', 'duration': 20.16, 'start': 4723.4, 'end': 4743.56, 'gender': 'female', 'candidate_1': "l'exercici perquè no paguen per l'ocupació de via pública incòlumes abans de poder implementar era un espai o forca amenaçats de més per ajudar-los i per a per a potenciar a este sector que realment hores d'ara no sabem com va com va ser deixa reingrés com agrisat tornar ha validat el per", 'candidate_2': "exercici perquè no paguen per l'ocupació de via pública inclús més abans sh podan implementar e 'augment d'espai o altres mejutes que estan man els ajuntaments per ajudar-los i per a potenciar aquestre sector que realment hores d'ara no sabem com vacom varser disiel reingrés com va serisat tornar a la normalitat que el preocuca", 'yt_url': 'https://www.youtube.com/watch?v=P0n7UCwb3M8&t=4723', 'license': 'CC-BY'}`

## BSC-LT/distilled-catalan-youtube-speech
- Error: `{'ok': False, 'status_code': 500, 'url': 'https://datasets-server.huggingface.co/splits?dataset=BSC-LT%2Fdistilled-catalan-youtube-speech', 'error': {'error': 'Cannot get the config names for the dataset.', 'cause_exception': 'RuntimeError', 'cause_message': 'Dataset scripts are no longer supported, but found distilled-catalan-youtube-speech.py', 'cause_traceback': ['Traceback (most recent call last):\n', '  File "/src/services/worker/src/worker/job_runners/dataset/config_names.py", line 66, in compute_config_names_response\n    config_names = get_dataset_config_names(\n                   ^^^^^^^^^^^^^^^^^^^^^^^^^\n', '  File "/usr/local/lib/python3.12/site-packages/datasets/inspect.py", line 161, in get_dataset_config_names\n    dataset_module = dataset_module_factory(\n                     ^^^^^^^^^^^^^^^^^^^^^^^\n', '  File "/usr/local/lib/python3.12/site-packages/datasets/load.py", line 1207, in dataset_module_factory\n    raise e1 from None\n', '  File "/usr/local/lib/python3.12/site-packages/datasets/load.py", line 1167, in dataset_module_factory\n    raise RuntimeError(f"Dataset scripts are no longer supported, but found {filename}")\n', 'RuntimeError: Dataset scripts are no longer supported, but found distilled-catalan-youtube-speech.py\n']}}`

## projecte-aina/corts_valencianes_asr_a
- Error: `{'ok': False, 'status_code': 501, 'url': 'https://datasets-server.huggingface.co/splits?dataset=projecte-aina%2Fcorts_valencianes_asr_a', 'error': {'error': "The dataset viewer doesn't support this dataset because it runs arbitrary Python code. You can convert it to a Parquet data-only dataset by using the convert_to_parquet CLI from the datasets library. See: https://huggingface.co/docs/datasets/main/en/cli#convert-to-parquet"}}`
