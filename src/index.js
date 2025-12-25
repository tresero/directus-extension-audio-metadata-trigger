const mm = require('music-metadata');

// CONFIGURATION:
// Users can set "AUDIO_METADATA_COLLECTION" in their Docker .env file.
// If not set, it defaults to "audio_files".
const TARGET_COLLECTION = process.env.AUDIO_METADATA_COLLECTION || 'audio_files';

module.exports = ({ action }, { services, getSchema }) => {
    // 1. REGISTER TRIGGERS
    // We listen for both creation and updates on the target collection.
    action(`${TARGET_COLLECTION}.items.create`, async (meta, context) => processAudio(meta, context));
    action(`${TARGET_COLLECTION}.items.update`, async (meta, context) => processAudio(meta, context));

    async function processAudio(meta, { schema, database }) {
        const { AssetsService, ItemsService } = services;
        const payload = meta.payload;

        // Directus passes a single 'key' on create, but an array of 'keys' on update.
        // We normalize this to an array so we can handle both consistently.
        const recordIds = meta.keys || [meta.key];

        // 2. SETUP CONTEXT
        // We must manually construct the context for the services.
        // CRITICAL: We pass "accountability: { admin: true }" to bypass permission checks.
        // CRITICAL: We pass "services" so AssetsService can load system settings.
        const context = { 
            schema, 
            knex: database,
            services, 
            accountability: { admin: true }
        };

        // Instantiate services with our admin context
        const items = new ItemsService(TARGET_COLLECTION, context);
        const assets = new AssetsService(context);

        // console.log(`[Audio Hook] Processing ${recordIds.length} record(s) in ${TARGET_COLLECTION}...`);

        for (const recordKey of recordIds) {
            try {
                // 3. RESOLVE FILE ID
                // If the 'asset' field is in the payload, use it.
                // If not (e.g. updating the title of an existing track), fetch it from the DB.
                let fileId = payload.asset;

                if (!fileId) {
                    const existingRecord = await items.readOne(recordKey, { fields: ['asset'] });
                    fileId = existingRecord?.asset;
                }

                // If there is still no file attached, skip this record.
                if (!fileId) continue;

                // 4. GET AUDIO STREAM (S3 OPTIMIZED)
                // We request the asset stream from Directus (which fetches from S3/Local).
                // IMPORTANT: Do NOT pass a second argument (options object). 
                // Passing {} causes Directus to trigger Image Transformation logic, which crashes on MP3s.
                const { stream } = await assets.getAsset(fileId); 

                // 5. PARSE METADATA
                // We parse the stream on-the-fly. 
                // 'skipCovers' and 'skipPostHeaders' ensure we stop reading as soon as we have the technical data.
                // This saves bandwidth/RAM by ignoring the rest of the file (e.g. huge 100MB WAVs).
                const metadata = await mm.parseStream(stream, { mimeType: 'audio/mpeg' }, { 
                    duration: true, 
                    skipCovers: true, 
                    skipPostHeaders: true 
                });

                // Destroy the stream immediately to stop downloading data we don't need.
                stream.destroy();

                // 6. PREPARE UPDATE DATA
                const updateData = {
                    duration: Math.round(metadata.format.duration * 1000), // Convert seconds to ms
                    bit_rate: metadata.format.bitrate,
                    sample_rate: metadata.format.sampleRate,
                    channels: metadata.format.numberOfChannels,
                    is_lossless: metadata.format.lossless,
                    year: metadata.common.year
                };

                // 7. SAVE TO DATABASE
                // 'emitEvents: false' prevents this update from re-triggering this hook (infinite loop protection).
                await items.updateOne(recordKey, updateData, { emitEvents: false });
                console.log(`[Audio Hook] Successfully updated metadata for record: ${recordKey}`);

            } catch (error) {
                // Graceful error handling prevents the whole Directus process from crashing
                console.error(`[Audio Hook] Error processing record ${recordKey}:`, error.message);

                // Optional: Log 'file not found' specifically for debugging S3 issues
                if (error.code === 'ENOENT') {
                    console.error("[Audio Hook] File appears to be missing from storage.");
                }
            }
        }
    }
};