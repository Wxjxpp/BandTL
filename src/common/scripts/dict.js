/**
 * 词典数据管理模块
 * 负责：内置词典加载、用户词典导入/持久化、词典切换、本地搜索匹配
 *       interconnect 分块接收（来自 AstroBox BandTL 词典导入插件）
 * 适配 Vela 快应用 system.file / system.storage / system.interconnect 接口
 *
 * 注意：内置词典直接嵌入 JS 常量，不依赖 @system.file 读取打包资源，
 *       避免 Vela 文件系统 API 对 bundle 内资源路径支持不一致的问题。
 */

import file from '@system.file'
import storage from '@system.storage'
import prompt from '@system.prompt'

// 持久化存储的文件 URI
const USER_DICT_URI = 'internal://files/user_dict.json'
const ACTIVE_DICT_KEY = 'active_dict_name'

// ===== 内置词典（直接嵌入，不依赖文件系统） =====
const BUILTIN_DICT = {
  name: '基础英汉词典',
  version: '1.0',
  lang: 'en-zh',
  count: 60,
  source: 'builtin',
  words: [
    { id: 1, word: 'apple', phonetic: 'ˈæpl', translation: 'n. 苹果' },
    { id: 2, word: 'banana', phonetic: 'bəˈnɑːnə', translation: 'n. 香蕉' },
    { id: 3, word: 'book', phonetic: 'bʊk', translation: 'n. 书，书籍' },
    { id: 4, word: 'cat', phonetic: 'kæt', translation: 'n. 猫' },
    { id: 5, word: 'dog', phonetic: 'dɒɡ', translation: 'n. 狗' },
    { id: 6, word: 'egg', phonetic: 'eɡ', translation: 'n. 鸡蛋' },
    { id: 7, word: 'fish', phonetic: 'fɪʃ', translation: 'n. 鱼' },
    { id: 8, word: 'good', phonetic: 'ɡʊd', translation: 'adj. 好的' },
    { id: 9, word: 'hello', phonetic: 'həˈləʊ', translation: 'int. 你好' },
    { id: 10, word: 'ice', phonetic: 'aɪs', translation: 'n. 冰' },
    { id: 11, word: 'jump', phonetic: 'dʒʌmp', translation: 'v. 跳跃' },
    { id: 12, word: 'key', phonetic: 'kiː', translation: 'n. 钥匙' },
    { id: 13, word: 'love', phonetic: 'lʌv', translation: 'n./v. 爱' },
    { id: 14, word: 'man', phonetic: 'mæn', translation: 'n. 男人' },
    { id: 15, word: 'name', phonetic: 'neɪm', translation: 'n. 名字' },
    { id: 16, word: 'orange', phonetic: 'ˈɒrɪndʒ', translation: 'n. 橙子' },
    { id: 17, word: 'pen', phonetic: 'pen', translation: 'n. 钢笔' },
    { id: 18, word: 'quiet', phonetic: 'ˈkwaɪət', translation: 'adj. 安静的' },
    { id: 19, word: 'run', phonetic: 'rʌn', translation: 'v. 跑' },
    { id: 20, word: 'sun', phonetic: 'sʌn', translation: 'n. 太阳' },
    { id: 21, word: 'time', phonetic: 'taɪm', translation: 'n. 时间' },
    { id: 22, word: 'use', phonetic: 'juːz', translation: 'v. 使用' },
    { id: 23, word: 'water', phonetic: 'ˈwɔːtə', translation: 'n. 水' },
    { id: 24, word: 'box', phonetic: 'bɒks', translation: 'n. 盒子' },
    { id: 25, word: 'yes', phonetic: 'jes', translation: 'adv. 是的' },
    { id: 26, word: 'zoo', phonetic: 'zuː', translation: 'n. 动物园' },
    { id: 27, word: 'able', phonetic: 'ˈeɪbl', translation: 'adj. 能干的' },
    { id: 28, word: 'big', phonetic: 'bɪɡ', translation: 'adj. 大的' },
    { id: 29, word: 'city', phonetic: 'ˈsɪti', translation: 'n. 城市' },
    { id: 30, word: 'day', phonetic: 'deɪ', translation: 'n. 白天' },
    { id: 31, word: 'eat', phonetic: 'iːt', translation: 'v. 吃' },
    { id: 32, word: 'friend', phonetic: 'frend', translation: 'n. 朋友' },
    { id: 33, word: 'happy', phonetic: 'ˈhæpi', translation: 'adj. 快乐的' },
    { id: 34, word: 'idea', phonetic: 'aɪˈdɪə', translation: 'n. 想法' },
    { id: 35, word: 'job', phonetic: 'dʒɒb', translation: 'n. 工作' },
    { id: 36, word: 'kind', phonetic: 'kaɪnd', translation: 'adj. 友好的' },
    { id: 37, word: 'long', phonetic: 'lɒŋ', translation: 'adj. 长的' },
    { id: 38, word: 'music', phonetic: 'ˈmjuːzɪk', translation: 'n. 音乐' },
    { id: 39, word: 'new', phonetic: 'njuː', translation: 'adj. 新的' },
    { id: 40, word: 'old', phonetic: 'əʊld', translation: 'adj. 老的' },
    { id: 41, word: 'play', phonetic: 'pleɪ', translation: 'v. 玩' },
    { id: 42, word: 'question', phonetic: 'ˈkwestʃən', translation: 'n. 问题' },
    { id: 43, word: 'red', phonetic: 'red', translation: 'adj. 红色的' },
    { id: 44, word: 'school', phonetic: 'skuːl', translation: 'n. 学校' },
    { id: 45, word: 'teacher', phonetic: 'ˈtiːtʃə', translation: 'n. 老师' },
    { id: 46, word: 'under', phonetic: 'ˈʌndə', translation: 'prep. 在...下面' },
    { id: 47, word: 'very', phonetic: 'ˈveri', translation: 'adv. 非常' },
    { id: 48, word: 'watch', phonetic: 'wɒtʃ', translation: 'n. 手表 v. 观看' },
    { id: 49, word: 'year', phonetic: 'jɪə', translation: 'n. 年' },
    { id: 50, word: 'zero', phonetic: 'ˈzɪərəʊ', translation: 'num. 零' },
    { id: 51, word: 'morning', phonetic: 'ˈmɔːnɪŋ', translation: 'n. 早晨' },
    { id: 52, word: 'night', phonetic: 'naɪt', translation: 'n. 夜晚' },
    { id: 53, word: 'food', phonetic: 'fuːd', translation: 'n. 食物' },
    { id: 54, word: 'drink', phonetic: 'drɪŋk', translation: 'v. 喝 n. 饮料' },
    { id: 55, word: 'home', phonetic: 'həʊm', translation: 'n. 家' },
    { id: 56, word: 'work', phonetic: 'wɜːk', translation: 'v./n. 工作' },
    { id: 57, word: 'read', phonetic: 'riːd', translation: 'v. 阅读' },
    { id: 58, word: 'write', phonetic: 'raɪt', translation: 'v. 写' },
    { id: 59, word: 'learn', phonetic: 'lɜːn', translation: 'v. 学习' },
    { id: 60, word: 'word', phonetic: 'wɜːd', translation: 'n. 单词' }
  ]
}

// ===== interconnect 分块接收状态 =====
// 协议帧（均为 JSON 字符串）：
//   {"type":"start","name":"词典名","total":N}
//   {"type":"chunk","index":i,"content":"..."}
//   {"type":"end"}
let importState = {
  phase: 'idle',        // idle | receiving | done | error
  name: '',
  received: 0,
  total: 0,
  chunks: [],
  error: '',
  dict: null
}
let importListeners = []

function cloneState() {
  return {
    phase: importState.phase,
    name: importState.name,
    received: importState.received,
    total: importState.total,
    error: importState.error,
    dict: importState.dict
  }
}

function notifyListeners() {
  const snap = cloneState()
  for (let i = 0; i < importListeners.length; i++) {
    try {
      importListeners[i](snap)
    } catch (e) {
      // 忽略单个监听器异常
    }
  }
}

/**
 * 处理来自 interconnect 的一帧消息（字符串）
 * @param {String} msgStr
 */
function handleInterconnectMessage(msgStr) {
  let frame
  try {
    frame = JSON.parse(msgStr)
  } catch (e) {
    importState.phase = 'error'
    importState.error = '收到无法解析的帧'
    notifyListeners()
    return
  }
  if (!frame || !frame.type) return

  if (frame.type === 'start') {
    importState.phase = 'receiving'
    importState.name = frame.name || '推送词典'
    importState.total = frame.total || 0
    importState.received = 0
    importState.chunks = []
    importState.error = ''
    importState.dict = null
    notifyListeners()
    return
  }

  if (frame.type === 'chunk') {
    if (importState.phase !== 'receiving') return
    const idx = frame.index
    importState.chunks[idx] = frame.content || ''
    importState.received = importState.received + 1
    notifyListeners()
    return
  }

  if (frame.type === 'end') {
    if (importState.phase !== 'receiving') return
    // 合并所有分块
    let fullText = ''
    for (let i = 0; i < importState.chunks.length; i++) {
      const c = importState.chunks[i]
      if (c !== undefined && c !== null) {
        fullText += c
      }
    }
    let dict
    try {
      dict = JSON.parse(fullText)
    } catch (e) {
      importState.phase = 'error'
      importState.error = '词典 JSON 解析失败'
      importState.chunks = []
      notifyListeners()
      return
    }
    // 校验词典结构
    if (!dict || !dict.words || !Array.isArray(dict.words)) {
      importState.phase = 'error'
      importState.error = '词典格式不符：缺少 words 数组'
      importState.chunks = []
      notifyListeners()
      return
    }
    dict.source = 'user'
    dict.importedAt = Date.now()
    // 持久化
    saveUserDict(dict, function (res) {
      if (res.success) {
        storage.set({ key: ACTIVE_DICT_KEY, value: dict.name || '用户词典' })
        importState.phase = 'done'
        importState.dict = dict
        importState.chunks = []
        notifyListeners()
      } else {
        importState.phase = 'error'
        importState.error = res.error || '保存失败'
        importState.chunks = []
        notifyListeners()
      }
    })
    return
  }
}

/**
 * 读取内置词典（同步，直接返回嵌入的 JS 对象，无需文件系统）。
 * @param {Function} callback({success: Boolean, dict: Object, error: String})
 */
function loadBuiltinDict(callback) {
  try {
    // 深拷贝避免外部修改污染常量
    const dict = JSON.parse(JSON.stringify(BUILTIN_DICT))
    callback({ success: true, dict: dict })
  } catch (e) {
    callback({ success: false, error: '内置词典构造失败: ' + e })
  }
}

/**
 * 读取用户导入的词典（持久化在 internal://files/）
 * @param {Function} callback({success: Boolean, dict: Object|null, error: String})
 */
function loadUserDict(callback) {
  file.readText({
    uri: USER_DICT_URI,
    success: function (data) {
      if (!data.text) {
        callback({ success: true, dict: null })
        return
      }
      try {
        const dict = JSON.parse(data.text)
        dict.source = 'user'
        callback({ success: true, dict: dict })
      } catch (e) {
        callback({ success: false, error: '用户词典解析失败: ' + e })
      }
    },
    fail: function (data, code) {
      // 文件不存在视为无用户词典，非错误
      callback({ success: true, dict: null })
    }
  })
}

/**
 * 持久化保存用户导入的词典
 * @param {Object} dict 词典对象
 * @param {Function} callback({success: Boolean, error: String})
 */
function saveUserDict(dict, callback) {
  const text = JSON.stringify(dict)
  file.writeText({
    uri: USER_DICT_URI,
    text: text,
    success: function () {
      callback({ success: true })
    },
    fail: function (data, code) {
      callback({ success: false, error: '保存词典失败 code=' + code })
    }
  })
}

/**
 * 获取当前启用的词典（内置词典立即可用，用户导入词典异步叠加）。
 * 
 * 回调可能被调用两次：
 *   1. 首次：立即返回内置词典（同步）
 *   2. 第二次（可选）：如果用户导入词典存在，再次回调返回用户词典
 * 
 * 用法：页面内部维护一个 dict 引用，每次回调都更新它。
 * 
 * @param {Function} callback({success: Boolean, dict: Object, error: String})
 */
function getActiveDict(callback) {
  // 1. 内置词典始终立即可用（同步深拷贝，不依赖文件系统）
  var builtin = JSON.parse(JSON.stringify(BUILTIN_DICT))
  callback({ success: true, dict: builtin })

  // 2. 异步尝试加载用户导入词典，如果存在则覆盖
  loadUserDict(function (uRes) {
    if (uRes.success && uRes.dict) {
      callback({ success: true, dict: uRes.dict })
    }
  })
}

/**
 * 删除用户导入的词典，恢复使用内置词典
 * @param {Function} callback({success: Boolean, error: String})
 */
function removeUserDict(callback) {
  file.delete({
    uri: USER_DICT_URI,
    success: function () {
      storage.set({ key: ACTIVE_DICT_KEY, value: '基础英汉词典' })
      callback({ success: true })
    },
    fail: function (data, code) {
      // 文件不存在也算成功
      callback({ success: true })
    }
  })
}

/**
 * 本地搜索匹配（核心算法）
 * 匹配优先级：前缀匹配 > 包含匹配 > 中文释义包含
 * @param {String} query 用户输入的关键词（英文/中文）
 * @param {Array} words 词典词条数组
 * @param {Number} limit 返回结果上限
 * @returns {Array} 匹配的词条数组
 */
function search(query, words, limit) {
  if (!query || !words || !words.length) return []
  query = String(query).toLowerCase().trim()
  if (!query) return []
  limit = limit || 50

  const prefixMatches = []
  const containMatches = []
  const transMatches = []

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const word = String(w.word || '').toLowerCase()
    const trans = String(w.translation || '')

    if (word.indexOf(query) === 0) {
      // 前缀匹配（最高优先级）
      prefixMatches.push(w)
    } else if (word.indexOf(query) > -1) {
      // 英文单词包含
      containMatches.push(w)
    } else if (trans.indexOf(query) > -1) {
      // 中文释义包含
      transMatches.push(w)
    }
  }

  // 合并并去重（按 id）
  const result = []
  const seen = {}
  const all = prefixMatches.concat(containMatches).concat(transMatches)
  for (let i = 0; i < all.length && result.length < limit; i++) {
    const id = all[i].id || (all[i].word + i)
    if (!seen[id]) {
      seen[id] = true
      result.push(all[i])
    }
  }
  return result
}

/**
 * 显示 toast 提示
 * @param {String} msg
 */
function showToast(msg) {
  prompt.showToast({
    message: msg
  })
}

export default {
  loadBuiltinDict: loadBuiltinDict,
  loadUserDict: loadUserDict,
  saveUserDict: saveUserDict,
  getActiveDict: getActiveDict,
  removeUserDict: removeUserDict,
  search: search,
  showToast: showToast,
  // interconnect 接收相关
  handleInterconnectMessage: handleInterconnectMessage,
  onImportStatus: function (fn) {
    importListeners.push(fn)
    // 立即推送一次当前状态
    try { fn(cloneState()) } catch (e) {}
    return function () {
      const i = importListeners.indexOf(fn)
      if (i >= 0) importListeners.splice(i, 1)
    }
  },
  resetImportState: function () {
    importState = {
      phase: 'idle',
      name: '',
      received: 0,
      total: 0,
      chunks: [],
      error: '',
      dict: null
    }
    notifyListeners()
  },
  USER_DICT_URI: USER_DICT_URI,
  ACTIVE_DICT_KEY: ACTIVE_DICT_KEY
}
