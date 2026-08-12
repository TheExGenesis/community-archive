import type { AvatarType } from '@/lib/types'

export const HOMEPAGE_FEATURED_ARCHIVE_COUNT = 8

// Each visit samples one archive from every editorial bucket. The buckets keep
// the guest homepage representative without turning follower count into the
// selection rule.
export const FEATURED_ARCHIVE_GROUPS = [
  [
    {
      account_id: '1460283925',
      username: 'tszzl',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1918970926668054530/fy-ZsgJ7_normal.jpg',
    },
    {
      account_id: '15484497',
      username: 'davidad',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/2039387630429962240/otpCVDdJ_normal.jpg',
    },
    {
      account_id: '133152680',
      username: 'robertskmiles',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/378800000405146386/3399885bef1d5f51eef9627b1943fbd4_normal.png',
    },
  ],
  [
    {
      account_id: '20844341',
      username: 'patio11',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1346314816827232256/zCQCJW6N_normal.jpg',
    },
    {
      account_id: '905201',
      username: 'eshear',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1638646637710147584/odiqsmwE_normal.jpg',
    },
    {
      account_id: '713094195955830785',
      username: 'm1guelpf',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1905044735112486912/-P-N0qfO_normal.jpg',
    },
  ],
  [
    {
      account_id: '16884623',
      username: 'visakanv',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1873013046534389766/s0bLkrmP_normal.jpg',
    },
    {
      account_id: '316970336',
      username: 'RichDecibels',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/2060979706481004544/EzSFzQUs_normal.jpg',
    },
    {
      account_id: '18280363',
      username: 'TylerAlterman',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/2021435361260601347/V4IXxe1B_normal.jpg',
    },
  ],
  [
    {
      account_id: '1359981346119155719',
      username: 'repligate',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1359982307998896128/YM34-MZK_normal.jpg',
    },
    {
      account_id: '1016470827775086592',
      username: 'QiaochuYuan',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1746687266947555328/OIMkOG55_normal.jpg',
    },
    {
      account_id: '49044207',
      username: 'Malcolm_Ocean',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1597473359926767621/O6K5gtN2_normal.jpg',
    },
  ],
  [
    {
      account_id: '282948199',
      username: 'algekalipso',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1590674754/test_pilot_by_beaucoupzero-d1zjngf_normal.jpg',
    },
    {
      account_id: '2063951',
      username: 'tasshinfogleman',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1904163665986965504/AGy82Vh9_normal.jpg',
    },
    {
      account_id: '1044604087013015552',
      username: 'vividvoid',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1594918968292044801/bZFpY73J_normal.jpg',
    },
  ],
  [
    {
      account_id: '13232322',
      username: 'DanielleFong',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1757993684614922240/SjwWIKOZ_normal.jpg',
    },
    {
      account_id: '1365020011123773442',
      username: 'Teknium',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1642401912648777728/2KFikPsE_normal.jpg',
    },
    {
      account_id: '17562763',
      username: 'Conaw',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1327975905780670464/gbBmU0Gf_normal.jpg',
    },
  ],
  [
    {
      account_id: '1223231444429856769',
      username: 'the_wilderless',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1991884556618862592/iB2nqI0__normal.jpg',
    },
    {
      account_id: '1584642529',
      username: 'eigenrobot',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1721210613869740032/YWD1qX3H_normal.jpg',
    },
    {
      account_id: '14816854',
      username: 'katiebakes',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/92444681/n300283_31649789_8973_2_normal.jpg',
    },
  ],
  [
    {
      account_id: '826134955549790208',
      username: 'christineist',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/2087604032059940864/aNWfsob4_normal.jpg',
    },
    {
      account_id: '86927771',
      username: 'tessera_antra',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/1841998305745620992/8jUo5S3Z_normal.jpg',
    },
    {
      account_id: '269148958',
      username: 'Prigoose',
      avatar_media_url:
        'https://pbs.twimg.com/profile_images/2076980377348956160/bVaPFuk3_normal.jpg',
    },
  ],
] as const satisfies ReadonlyArray<ReadonlyArray<AvatarType>>

function randomIndex(length: number, random: () => number): number {
  const value = random()
  const bounded = Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 0.999999999999)
    : 0
  return Math.floor(bounded * length)
}

export function sampleFeaturedArchives(
  random: () => number = Math.random,
): AvatarType[] {
  const sampled = FEATURED_ARCHIVE_GROUPS.map(
    (group) => group[randomIndex(group.length, random)],
  )

  for (let index = sampled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, random)
    ;[sampled[index], sampled[swapIndex]] = [sampled[swapIndex], sampled[index]]
  }

  return sampled.map((archive) => ({ ...archive }))
}
