'use strict'

const Platforms = Object.freeze({
    Youtube: 'ytsearch',
    YoutubeMusic: 'ytmsearch',
    Soundcloud: 'scsearch',
    AppleMusic: 'amsearch',
    Deezer: 'dzsearch',
    Spotify: 'spsearch',
    VkMusic: 'vksearch',
    YandexMusic: 'ymsearch',
    AmazonMusic: 'amznsearch',
    Audius: 'ausearch',
    Gaana: 'gaanasearch',
    Jiosaavn: 'jssearch',
    Lastfm: 'lfsearch',
    Napster: 'npsearch',
    Pandora: 'pdsearch',
    Qobuz: 'qbsearch',
    Tidal: 'tdsearch',
    Shazam: 'szsearch',
})

const PlatformNames = Object.freeze({
    [Platforms.Youtube]: 'YouTube',
    [Platforms.YoutubeMusic]: 'YouTube Music',
    [Platforms.Soundcloud]: 'SoundCloud',
    [Platforms.AppleMusic]: 'Apple Music',
    [Platforms.Deezer]: 'Deezer',
    [Platforms.Spotify]: 'Spotify',
    [Platforms.VkMusic]: 'VK Music',
    [Platforms.YandexMusic]: 'Yandex Music',
    [Platforms.AmazonMusic]: 'Amazon Music',
    [Platforms.Audius]: 'Audius',
    [Platforms.Gaana]: 'Gaana',
    [Platforms.Jiosaavn]: 'JioSaavn',
    [Platforms.Lastfm]: 'Last.fm',
    [Platforms.Napster]: 'Napster',
    [Platforms.Pandora]: 'Pandora',
    [Platforms.Qobuz]: 'Qobuz',
    [Platforms.Tidal]: 'Tidal',
    [Platforms.Shazam]: 'Shazam',
})

const PlatformAliases = Object.freeze({
    yt: Platforms.Youtube,
    ytm: Platforms.YoutubeMusic,
    sc: Platforms.Soundcloud,
    am: Platforms.AppleMusic,
    dz: Platforms.Deezer,
    sp: Platforms.Spotify,
    vk: Platforms.VkMusic,
    ym: Platforms.YandexMusic,
    amzn: Platforms.AmazonMusic,
    au: Platforms.Audius,
    gaana: Platforms.Gaana,
    js: Platforms.Jiosaavn,
    lf: Platforms.Lastfm,
    np: Platforms.Napster,
    pd: Platforms.Pandora,
    qb: Platforms.Qobuz,
    td: Platforms.Tidal,
    sz: Platforms.Shazam,
})

const PlatformPatterns = Object.freeze({
    [Platforms.Youtube]: /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|playlist\?list=)|youtu\.be\/)[\w-]+/i,
    [Platforms.YoutubeMusic]: /^https?:\/\/music\.youtube\.com\//i,
    [Platforms.Soundcloud]: /^(?:https?:\/\/)?(?:www\.|m\.)?soundcloud\.com\/[a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+(?:\/s-[a-zA-Z0-9-_]+)?/i,
    [Platforms.Spotify]: /^(?:https?:\/\/)?(?:www\.)?open\.spotify\.com\/(?:[a-zA-Z-]+\/)?(?:user\/[a-zA-Z0-9-_]+\/)?(?:track|album|playlist|artist)\/[a-zA-Z0-9-_]+/i,
    [Platforms.AppleMusic]: /^(?:https?:\/\/)?(?:www\.)?music\.apple\.com\/((?<countrycode>[a-zA-Z]{2})\/)?(?<type>album|playlist|artist|song)(\/[a-zA-Z\p{L}\d\-%]+)?\/(?<identifier>[a-zA-Z\d\-.]+)(\?i=(?<identifier2>\d+))?/i,
    [Platforms.Deezer]: /^(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-zA-Z]{2}\/)?(?:track|album|playlist|artist)\/[0-9]+/i,
    [Platforms.VkMusic]: /^(?:https?:\/\/)?(?:www\.)?vk\.(?:com|ru)\/(?:audio-?\d+_-?\d+|audios\d+\?q=[^&]+&z=audio_playlist-?[A-Za-z\d]+_-?[A-Za-z\d]+|music\/(?:playlist|album)\/-?[A-Za-z\d]+_-?[A-Za-z\d]+|artist\/[^/?#]+)/i,
    [Platforms.YandexMusic]: /^(?:https?:\/\/)?music\.yandex\.(?:ru|com|kz|by)\/(?:(?:artist|album|track)\/[0-9]+(?:\/track\/[0-9]+)?|users\/[0-9A-Za-z@.-]+\/playlists\/[0-9]+|playlists\/[0-9A-Za-z\-.]+)\/?/i,
    [Platforms.AmazonMusic]: /^https?:\/\/music\.amazon\.[^/]+\/(?:albums|tracks|artists|playlists|user-playlists)\/[A-Za-z0-9]+(?:\/[^/?#]+)?(?:[/?].*)?$/i,
    [Platforms.Gaana]: /^@?(?:https?:\/\/)?(?:www\\\.)?gaana\.com\/(?<type>song|album|playlist|artist)\/(?<seokey>[\\w\\-]+)(?:[?#].*)?$/,
    [Platforms.Jiosaavn]: /^https?:\/\/www\\.jiosaavn\\.com\/(?<type>album|featured|song|s\/playlist|artist)\/[^/]+\/(?<id>[A-Za-z0-9_,\\-]+)/,
    [Platforms.Lastfm]: /^https?:\/\/(?:www\\.)?last\\.fm\/music\/([^/?#]+)(?:\/([^/?#]+)(?:\/([^/?#]+))?)?\/?(?:\\?.*)?$/,
    [Platforms.Napster]: /^https?:\/\/(?:(?:www\\.|play\\.)?napster\\.com\/)(?:artist\/([\\w.-]+)|album\/([\\w.-]+)|track\/([\\w.-]+))(?:\\?.*?(?:trackId=([\\w.-]+)).*?)?/,
    [Platforms.Pandora]: /^@?(?:https?:\/\/)?(?:www\\\.)?pandora\\.com\/(?:playlist\/(?<id>PL:[\\d:]+)|artist\/(?:[\\w\\-]+\/)*(?<id2>(?:TR|AL|AR)[A-Za-z0-9]+))(?:[?#].*)?$/,
    [Platforms.Qobuz]: /^https?:\/\/(?:www\\.|play\\.|open\\.)?qobuz\\.com\/(?:(?:[a-z]{2}-[a-z]{2}\/)?(?<type>album|playlist|track|artist)\/(?:.+?\/)?(?<id>[a-zA-Z0-9]+)|(?<type2>playlist)\/(?<id2>\\d+))/,
    [Platforms.Tidal]: /^https?:\/(?:\/(?:listen|www)\\\.)?tidal\\.com\/(?:browse\/)?(?<type>album|track|playlist|mix)\/(?<id>[a-zA-Z0-9\\-]+)(?:\\?.*)?/, 
    [Platforms.Shazam]: /^https?:\/\/(?:www\\.)?shazam\\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:song|track)\/(\d+)(?:\/([^/?#]+))?\/?(?:\\?.*)?$/,
    [Platforms.Audius]: /^https?:\/\/(?:www\.)?audius\.co\/(?:[^/]+\/(?:playlist|album)\/[^/?#]+|[^/]+\/[^/?#]+|[^/?#]+)(?:\?.*)?$/i,
})

const PlatformUtils = {
  isValid(platform) {
    return Object.values(Platforms).includes(platform)
  },

  resolve(alias) {
    if (!alias || typeof alias !== 'string') return null
    const lower = alias.toLowerCase().trim()
    return PlatformAliases[lower] || null
  },

  getName(platform) {
    return PlatformNames[platform] || platform
  },

  detectFromUrl(url) {
    if (!url || typeof url !== 'string') return null
    for (const [platform, pattern] of Object.entries(PlatformPatterns)) {
      if (pattern.test(url)) return platform
    }
    return null
  },

  getAll() {
    return Object.values(Platforms)
  },

  getAllNames() {
    return {...PlatformNames}
  },

  supportsPlaylists(platform) {
    return [
      Platforms.Youtube,
      Platforms.YoutubeMusic,
      Platforms.Spotify,
      Platforms.Soundcloud,
      Platforms.AppleMusic,
      Platforms.AmazonMusic,
      Platforms.Deezer,
      Platforms.VkMusic,
      Platforms.YandexMusic,
      Platforms.Gaana,
      Platforms.Jiosaavn,
      Platforms.Audius,
      Platforms.Pandora,
      Platforms.Qobuz,
      Platforms.Tidal
    ].includes(platform)
  },

  requiresAuth(platform) {
    return [
      Platforms.Spotify,
      Platforms.AppleMusic,
      Platforms.AmazonMusic,
      Platforms.Deezer,
      Platforms.YandexMusic,
      Platforms.VkMusic,
      Platforms.Gaana,
      Platforms.Jiosaavn,
      Platforms.Napster,
      Platforms.Pandora,
      Platforms.Qobuz,
      Platforms.Tidal
    ].includes(platform)
  }
}

module.exports = {
  Platforms,
  PlatformNames,
  PlatformAliases,
  PlatformPatterns,
  PlatformUtils,
  default: Platforms
}
