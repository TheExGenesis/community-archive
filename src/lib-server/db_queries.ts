export const getTweetsCount = async (supabase: any, account_id: string) => {
  return await supabase
    .schema('public')
    .from('account')
    .select('num_tweets', { count: 'planned' })
    .eq('account_id', account_id)
}
