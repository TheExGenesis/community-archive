#!/usr/bin/env bash
set -euo pipefail

latest_url="https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/community-archive-public-export/latest.json"
output_dir="${1:-public-export-release}"

for command in curl jq; do
  command -v "$command" >/dev/null || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done

mkdir -p "$output_dir"
curl --fail --silent --show-error --location --max-filesize 1048576 \
  "$latest_url" --output "$output_dir/latest.json"

export_id="$(jq -er '.export_id | select(type == "string" and length > 0)' "$output_dir/latest.json")"
manifest_url="$(jq -er '.manifest_url | select(type == "string" and length > 0)' "$output_dir/latest.json")"
object_root="${latest_url%latest.json}"

if [[ ! "$export_id" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z$ ]]; then
  echo "The public export ID has an unexpected format." >&2
  exit 1
fi

case "$manifest_url" in
  "$object_root"v1/"$export_id"/manifest.json) ;;
  *)
    echo "The manifest URL does not match the advertised export ID." >&2
    exit 1
    ;;
esac

curl --fail --silent --show-error --location --max-filesize 1048576 \
  "$manifest_url" --output "$output_dir/manifest.json"

manifest_export_id="$(jq -er '.export_id | select(type == "string" and length > 0)' "$output_dir/manifest.json")"
publication_status="$(jq -er '.publication.status' "$output_dir/manifest.json")"
tweets_url="$(jq -er '.publication.urls.tweets' "$output_dir/manifest.json")"
profiles_url="$(jq -er '.publication.urls.profiles' "$output_dir/manifest.json")"

if [[ "$manifest_export_id" != "$export_id" || "$publication_status" != "published" ]]; then
  echo "The current manifest is not a matching published export." >&2
  exit 1
fi

for entry in "tweets:$tweets_url" "profiles:$profiles_url"; do
  name="${entry%%:*}"
  url="${entry#*:}"
  case "$url" in
    "$object_root"v1/"$export_id"/"$name".parquet) ;;
    *)
      echo "The $name URL does not belong to the advertised export." >&2
      exit 1
      ;;
  esac

  magic_file="$(mktemp)"
  trap 'rm -f "$magic_file"' EXIT
  curl --fail --silent --show-error --location --range 0-3 --max-filesize 16 \
    "$url" --output "$magic_file"
  if [[ "$(LC_ALL=C tr -d '\n' < "$magic_file")" != "PAR1" ]]; then
    echo "The $name download is not a readable Parquet file." >&2
    exit 1
  fi
  rm -f "$magic_file"
  trap - EXIT
done

tweets_rows="$(jq -er '.files.tweets.rows' "$output_dir/manifest.json")"
profiles_rows="$(jq -er '.files.profiles.rows' "$output_dir/manifest.json")"
created_at="$(jq -er '.created_at' "$output_dir/manifest.json")"

cat > "$output_dir/RELEASE.md" <<EOF
# Community Archive public export

- Export: \`$export_id\`
- Created: \`$created_at\`
- Tweets: \`$tweets_rows\`
- Profiles: \`$profiles_rows\`

- [Download tweets.parquet]($tweets_url?download=tweets.parquet)
- [Download profiles.parquet]($profiles_url?download=profiles.parquet)
- [View manifest.json]($manifest_url)
- [View the stable latest.json pointer]($latest_url)

The Parquet files remain in the consent-managed Supabase package; this release
does not retain a second copy in GitHub.

These versioned download links work only while this export is advertised by
\`latest.json\`. Superseded packages are removed so withdrawn accounts are not
retained in historical downloads.
EOF

printf '%s\n' "$export_id"
