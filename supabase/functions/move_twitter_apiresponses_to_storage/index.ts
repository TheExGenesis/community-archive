import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const STORAGE_URL = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/twitter_api_files`

Deno.serve(async (req) => {
  const startTime = performance.now();
  let supabaseAdminClient: ReturnType<typeof createClient> | null = null;
  
  try {
    // Validate environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing required environment variables");
    }

    supabaseAdminClient = createClient(supabaseUrl, supabaseKey);
    
    const bucketName = "twitter_api_files";
    const res = await move_twitter_apiresponses_to_storage(supabaseAdminClient, bucketName);

    return new Response(
      JSON.stringify(res),
      { 
        headers: { 
          "Content-Type": "application/json",
          "X-Execution-Time": `${performance.now() - startTime}ms`
        } 
      },
    );

  } catch (e) {
    console.error('Function error:', e);
    
    return new Response(
      JSON.stringify({ 
        error: e instanceof Error ? e.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }), 
      { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "X-Execution-Time": `${performance.now() - startTime}ms`
        }
      }
    );
  } 
});

export async function move_twitter_apiresponses_to_storage(
  supabase: ReturnType<typeof createClient>,
  bucketName: string,
  batchSize: number = 150
): Promise<{ success: boolean; processedCount?: number; error?: any; failed?: any }> {
  try {
    const { data: tempRecords, error: fetchError } = await supabase
      .from('temporary_data')
      .select('*')
      .not('inserted', 'is', null)
      .eq('stored', false)
      .like('type', 'api_%')
      .limit(batchSize);

    if (fetchError) throw fetchError;
    if (!tempRecords || tempRecords.length === 0) {
      return { success: true, processedCount: 0 };
    }

    // Replace the sequential processing with parallel uploads
    const uploadRecord = async (record: any) => {
      const filename = `${record.originator_id}/${record.timestamp}__${record.type}.json`;
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filename, JSON.stringify(record.data), {
          contentType: 'application/json',
          upsert: true,
        });
      
      return { record, error };
    };

    const uploadResults = await Promise.all(tempRecords.map(uploadRecord));

    // Log any upload errors
    const failedUploads = uploadResults.filter(({ error }) => error);
    if (failedUploads.length > 0) {
      console.error(`Failed to upload ${failedUploads.length} records:`);
      failedUploads.forEach(({ record, error }) => {
        console.error(`Error uploading record ${record.id} (${record.type}):`, error);
      });
    }

    // Filter successful uploads
    const successfulUploads = uploadResults.filter(({ error }) => !error).map(({ record }) => record);

    // Batch update all successfully uploaded records
    if (successfulUploads.length > 0) {
      const { error: batchUpdateError } = await supabase
        .from('temporary_data')
        .update({ stored: true })
        .in('id', successfulUploads.map(r => r.id));
      
      if (batchUpdateError) {
        console.error('Batch update error:', batchUpdateError);
        throw batchUpdateError;
      }
    }

    const processedCount = successfulUploads.length;
    console.log("processedCount", processedCount);
    return { 
      success: true, 
      processedCount,
      failed: JSON.stringify(failedUploads)
    };
    
  } catch (error) {
    console.error('Error in processTemporaryData:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error in data processing',
      processedCount: 0
    };
  }
}