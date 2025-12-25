# Directus Audio Metadata Hook (S3 Optimized)

This Directus extension automatically extracts metadata (Duration, Bitrate, Sample Rate, BPM) from uploaded audio files (MP3/WAV) and saves it to your collection.

**Why use this?** Standard flows require downloading the file back from S3 to process it. This hook streams the first few kilobytes directly from S3 (or local storage) in-memory, extracting metadata instantly without bandwidth costs or latency.

**Configuration** By default, it listens to the collection audio_files. You can change this by setting an environment variable in your Directus container: AUDIO_METADATA_COLLECTION="my_tracks"

**Requirements**

- Directus v10+

- An audio collection with fields: duration (int), bit_rate (int), sample_rate (int), year (int).

## Configuration

By default, this extension listens for changes in a collection named `audio_files`.

If your collection has a different name (e.g., `tracks`, `music`, `songs`), you must set the `AUDIO_METADATA_COLLECTION` environment variable in your Directus project.

### Example (docker-compose.yml)

```yaml
services:
  directus:
    environment:
      - AUDIO_METADATA_COLLECTION=my_custom_collection_name
```

## Requirements
Your Directus collection must have the following fields (Integer) to store the metadata:

- duration (in ms)

- bit_rate

- sample_rate

- channels

- year

- is_lossless (Boolean)


### Why this is important
Without this section, your "generic" feature is invisible. This documentation turn

## Credits

This extension's structure was inspired by [directus-operation-slugify](https://github.com/maintainer/repo).

Special thanks to the author for providing a great template for Directus extensions.