/**
 * 手环词典 数据管理模块 v2.0
 * ——————————————————————————————————————
 * 数据结构：SortedArray + HashIndex（O(1) 精确 / O(log n) 前缀）
 * 内存上限：~500KB（2000词 × 5典 = 2.5MB 安全）
 * ——————————————————————————————————————
 * 特性：
 *  - 变形词查询（inflected → base word）
 *  - 多词典管理（启用/停用/删除/创建）
 *  - 内置+用户词典合并（去重叠加）
 *  - 模糊搜索（编辑距离≤1）
 *  - 手环自建词典（中文释义→英文翻译）
 *  - interconnect 分块接收
 */

import file from '@system.file'
import storage from '@system.storage'
import prompt from '@system.prompt'

// ===== 常量 =====
const DICT_STORE_URI = 'internal://files/dicts.json'
const ACTIVE_DICT_KEY = 'active_dicts'

// 内置词典（直接嵌入，零文件IO）
const BUILTIN_DICT = {
  name: '基础英汉词典',
  source: 'builtin',
  version: '2.0',
  lang: 'en-zh',
  count: 60,
  words: [
    { id: 1, word: 'apple', phonetic: 'ˈæpl', translation: 'n. 苹果', forms: ['apples'] },
    { id: 2, word: 'banana', phonetic: 'bəˈnɑːnə', translation: 'n. 香蕉', forms: ['bananas'] },
    { id: 3, word: 'book', phonetic: 'bʊk', translation: 'n. 书，书籍', forms: ['books', 'booking'] },
    { id: 4, word: 'cat', phonetic: 'kæt', translation: 'n. 猫', forms: ['cats'] },
    { id: 5, word: 'dog', phonetic: 'dɒɡ', translation: 'n. 狗', forms: ['dogs'] },
    { id: 6, word: 'egg', phonetic: 'eɡ', translation: 'n. 鸡蛋', forms: ['eggs'] },
    { id: 7, word: 'fish', phonetic: 'fɪʃ', translation: 'n. 鱼', forms: ['fishes', 'fishing', 'fished'] },
    { id: 8, word: 'good', phonetic: 'ɡʊd', translation: 'adj. 好的', forms: ['better', 'best'] },
    { id: 9, word: 'hello', phonetic: 'həˈləʊ', translation: 'int. 你好', forms: [] },
    { id: 10, word: 'ice', phonetic: 'aɪs', translation: 'n. 冰', forms: ['icy', 'iced'] },
    { id: 11, word: 'jump', phonetic: 'dʒʌmp', translation: 'v. 跳跃', forms: ['jumps', 'jumping', 'jumped'] },
    { id: 12, word: 'key', phonetic: 'kiː', translation: 'n. 钥匙', forms: ['keys'] },
    { id: 13, word: 'love', phonetic: 'lʌv', translation: 'n./v. 爱', forms: ['loves', 'loving', 'loved'] },
    { id: 14, word: 'man', phonetic: 'mæn', translation: 'n. 男人', forms: ['men'] },
    { id: 15, word: 'name', phonetic: 'neɪm', translation: 'n. 名字', forms: ['names', 'naming', 'named'] },
    { id: 16, word: 'orange', phonetic: 'ˈɒrɪndʒ', translation: 'n. 橙子', forms: ['oranges'] },
    { id: 17, word: 'pen', phonetic: 'pen', translation: 'n. 钢笔', forms: ['pens'] },
    { id: 18, word: 'quiet', phonetic: 'ˈkwaɪət', translation: 'adj. 安静的', forms: ['quieter', 'quietest', 'quietly'] },
    { id: 19, word: 'run', phonetic: 'rʌn', translation: 'v. 跑', forms: ['runs', 'running', 'ran'] },
    { id: 20, word: 'sun', phonetic: 'sʌn', translation: 'n. 太阳', forms: ['suns', 'sunny'] },
    { id: 21, word: 'time', phonetic: 'taɪm', translation: 'n. 时间', forms: ['times', 'timing', 'timed'] },
    { id: 22, word: 'use', phonetic: 'juːz', translation: 'v. 使用', forms: ['uses', 'using', 'used'] },
    { id: 23, word: 'water', phonetic: 'ˈwɔːtə', translation: 'n. 水', forms: ['waters', 'watering', 'watered'] },
    { id: 24, word: 'box', phonetic: 'bɒks', translation: 'n. 盒子', forms: ['boxes', 'boxing', 'boxed'] },
    { id: 25, word: 'yes', phonetic: 'jes', translation: 'adv. 是的', forms: [] },
    { id: 26, word: 'zoo', phonetic: 'zuː', translation: 'n. 动物园', forms: ['zoos'] },
    { id: 27, word: 'able', phonetic: 'ˈeɪbl', translation: 'adj. 能干的', forms: ['abler', 'ablest', 'ably'] },
    { id: 28, word: 'big', phonetic: 'bɪɡ', translation: 'adj. 大的', forms: ['bigger', 'biggest'] },
    { id: 29, word: 'city', phonetic: 'ˈsɪti', translation: 'n. 城市', forms: ['cities'] },
    { id: 30, word: 'day', phonetic: 'deɪ', translation: 'n. 白天', forms: ['days', 'daily'] },
    { id: 31, word: 'eat', phonetic: 'iːt', translation: 'v. 吃', forms: ['eats', 'eating', 'ate', 'eaten'] },
    { id: 32, word: 'friend', phonetic: 'frend', translation: 'n. 朋友', forms: ['friends', 'friendly'] },
    { id: 33, word: 'happy', phonetic: 'ˈhæpi', translation: 'adj. 快乐的', forms: ['happier', 'happiest', 'happily'] },
    { id: 34, word: 'idea', phonetic: 'aɪˈdɪə', translation: 'n. 想法', forms: ['ideas'] },
    { id: 35, word: 'job', phonetic: 'dʒɒb', translation: 'n. 工作', forms: ['jobs'] },
    { id: 36, word: 'kind', phonetic: 'kaɪnd', translation: 'adj. 友好的', forms: ['kinder', 'kindest', 'kindly'] },
    { id: 37, word: 'long', phonetic: 'lɒŋ', translation: 'adj. 长的', forms: ['longer', 'longest'] },
    { id: 38, word: 'music', phonetic: 'ˈmjuːzɪk', translation: 'n. 音乐', forms: ['musical', 'musician'] },
    { id: 39, word: 'new', phonetic: 'njuː', translation: 'adj. 新的', forms: ['newer', 'newest'] },
    { id: 40, word: 'old', phonetic: 'əʊld', translation: 'adj. 老的', forms: ['older', 'oldest'] },
    { id: 41, word: 'play', phonetic: 'pleɪ', translation: 'v. 玩', forms: ['plays', 'playing', 'played'] },
    { id: 42, word: 'question', phonetic: 'ˈkwestʃən', translation: 'n. 问题', forms: ['questions', 'questioning', 'questioned'] },
    { id: 43, word: 'red', phonetic: 'red', translation: 'adj. 红色的', forms: ['redder', 'reddest'] },
    { id: 44, word: 'school', phonetic: 'skuːl', translation: 'n. 学校', forms: ['schools'] },
    { id: 45, word: 'teacher', phonetic: 'ˈtiːtʃə', translation: 'n. 老师', forms: ['teachers'] },
    { id: 46, word: 'under', phonetic: 'ˈʌndə', translation: 'prep. 在...下面', forms: [] },
    { id: 47, word: 'very', phonetic: 'ˈveri', translation: 'adv. 非常', forms: [] },
    { id: 48, word: 'watch', phonetic: 'wɒtʃ', translation: 'v. 观看 n. 手表', forms: ['watches', 'watching', 'watched'] },
    { id: 49, word: 'year', phonetic: 'jɪə', translation: 'n. 年', forms: ['years', 'yearly'] },
    { id: 50, word: 'zero', phonetic: 'ˈzɪərəʊ', translation: 'num. 零', forms: ['zeros', 'zeroes'] },
    { id: 51, word: 'morning', phonetic: 'ˈmɔːnɪŋ', translation: 'n. 早晨', forms: ['mornings'] },
    { id: 52, word: 'night', phonetic: 'naɪt', translation: 'n. 夜晚', forms: ['nights', 'nightly'] },
    { id: 53, word: 'food', phonetic: 'fuːd', translation: 'n. 食物', forms: ['foods'] },
    { id: 54, word: 'drink', phonetic: 'drɪŋk', translation: 'v. 喝 n. 饮料', forms: ['drinks', 'drinking', 'drank', 'drunk'] },
    { id: 55, word: 'home', phonetic: 'həʊm', translation: 'n. 家', forms: ['homes', 'homing'] },
    { id: 56, word: 'work', phonetic: 'wɜːk', translation: 'v./n. 工作', forms: ['works', 'working', 'worked'] },
    { id: 57, word: 'read', phonetic: 'riːd', translation: 'v. 阅读', forms: ['reads', 'reading'] },
    { id: 58, word: 'write', phonetic: 'raɪt', translation: 'v. 写', forms: ['writes', 'writing', 'wrote', 'written'] },
    { id: 59, word: 'learn', phonetic: 'lɜːn', translation: 'v. 学习', forms: ['learns', 'learning', 'learned', 'learnt'] },
    { id: 60, word: 'word', phonetic: 'wɜːd', translation: 'n. 单词', forms: ['words'] }
  ]
}

// ===== 词典管理器核心 =====
// 数据结构：{ dicts: [Dict], _activeIdx: Map<name → index>, _merged: Dict|null }
// Dict: { name, source, enabled, words: [...], _wordMap: {word→idx}, _formMap: {form→idx} }

let _store = null
let _rebuildTimer = null

// 初始化 / 加载
function init() {
  _store = {
    dicts: [],
    _activeIdx: {},
    _merged: null,
    _mergedDirty: true
  }
  // 1. 内置词典常驻（不可删除，不可停用）
  var builtin = cloneDict(BUILTIN_DICT)
  builtin.enabled = true
  buildIndex(builtin)
  _store.dicts.push(builtin)
  _store._activeIdx[builtin.name] = 0
  // 2. 加载持久化词典
  loadPersistedDicts()
}

function cloneDict(d) {
  return JSON.parse(JSON.stringify(d))
}

// 构建 Hash 索引（word→idx，form→baseIdx）
function buildIndex(dict) {
  var wm = {}
  var fm = {}
  var words = dict.words || []
  for (var i = 0; i < words.length; i++) {
    var w = words[i]
    var wl = (w.word || '').toLowerCase()
    if (wl) wm[wl] = i
    var forms = w.forms || []
    for (var j = 0; j < forms.length; j++) {
      var fl = (forms[j] || '').toLowerCase()
      if (fl) fm[fl] = i
    }
  }
  dict._wordMap = wm
  dict._formMap = fm
  dict._sorted = true
  // 排序保证二分查找可用
  words.sort(function (a, b) {
    var aw = (a.word || '').toLowerCase()
    var bw = (b.word || '').toLowerCase()
    if (aw < bw) return -1
    if (aw > bw) return 1
    return 0
  })
  // 重建索引（排序后 idx 变了）
  wm = {}
  for (var i2 = 0; i2 < words.length; i2++) {
    var w2 = words[i2]
    wm[(w2.word || '').toLowerCase()] = i2
    var fs = w2.forms || []
    for (var k = 0; k < fs.length; k++) {
      fm[(fs[k] || '').toLowerCase()] = i2
    }
  }
  dict._wordMap = wm
  dict._formMap = fm
}

// 加载持久化词典
function loadPersistedDicts() {
  file.readText({
    uri: DICT_STORE_URI,
    success: function (data) {
      if (!data || !data.text) return
      try {
        var saved = JSON.parse(data.text)
        var dicts = saved.dicts || []
        for (var i = 0; i < dicts.length; i++) {
          var d = dicts[i]
          if (d.source === 'builtin') continue // 忽略旧版内置
          buildIndex(d)
          _store.dicts.push(d)
          _store._activeIdx[d.name] = _store.dicts.length - 1
        }
        _store._mergedDirty = true
      } catch (e) {
        // 解析失败忽略
      }
    },
    fail: function () {}
  })
}

// 持久化所有非内置词典
function persist() {
  var toSave = []
  for (var i = 0; i < _store.dicts.length; i++) {
    var d = _store.dicts[i]
    if (d.source === 'builtin') continue
    // 保存时去掉索引（减小体积）
    var clean = {
      name: d.name,
      source: d.source,
      enabled: d.enabled,
      words: d.words
    }
    toSave.push(clean)
  }
  file.writeText({
    uri: DICT_STORE_URI,
    text: JSON.stringify({ dicts: toSave }),
    success: function () {},
    fail: function () {}
  })
}

// 合并所有启用词典为统一检索结构
function rebuildMerged() {
  if (!_store._mergedDirty) return
  _store._mergedDirty = false

  var allWords = []
  var seen = {}
  var idSeq = 0

  for (var i = 0; i < _store.dicts.length; i++) {
    var d = _store.dicts[i]
    if (d.enabled === false) continue
    var words = d.words || []
    for (var j = 0; j < words.length; j++) {
      var w = words[j]
      var key = (w.word || '').toLowerCase()
      if (seen[key]) continue // 去重：内置优先
      seen[key] = true
      var entry = {
        id: ++idSeq,
        word: w.word,
        phonetic: w.phonetic || '',
        translation: w.translation || '',
        forms: w.forms || [],
        source: d.name
      }
      allWords.push(entry)
    }
  }

  // 按字母排序
  allWords.sort(function (a, b) {
    var aw = (a.word || '').toLowerCase()
    var bw = (b.word || '').toLowerCase()
    if (aw < bw) return -1
    if (aw > bw) return 1
    return 0
  })

  var merged = {
    name: '合并词典',
    source: 'merged',
    enabled: true,
    words: allWords
  }
  buildIndex(merged)
  _store._merged = merged
}

// ===== 公开 API =====

function getActiveDict(callback) {
  if (!_store) init()
  rebuildMerged()
  callback({ success: true, dict: _store._merged })
}

// 获取所有词典列表
function getAllDicts(callback) {
  if (!_store) init()
  var list = []
  for (var i = 0; i < _store.dicts.length; i++) {
    var d = _store.dicts[i]
    list.push({
      name: d.name,
      source: d.source,
      enabled: d.enabled !== false,
      wordCount: (d.words || []).length
    })
  }
  callback({ success: true, list: list })
}

// 切换词典启用/停用
function toggleDict(name, callback) {
  var idx = _store._activeIdx[name]
  if (idx === undefined || _store.dicts[idx].source === 'builtin') {
    callback({ success: false, error: '内置词典不可停用' })
    return
  }
  var d = _store.dicts[idx]
  d.enabled = !d.enabled
  _store._mergedDirty = true
  // 延迟持久化
  clearTimeout(_rebuildTimer)
  _rebuildTimer = setTimeout(persist, 500)
  callback({ success: true, enabled: d.enabled })
}

// 删除词典（不可删除内置）
function deleteDict(name, callback) {
  var idx = _store._activeIdx[name]
  if (idx === undefined) {
    callback({ success: false, error: '词典不存在' })
    return
  }
  if (_store.dicts[idx].source === 'builtin') {
    callback({ success: false, error: '内置词典不可删除' })
    return
  }
  _store.dicts.splice(idx, 1)
  // 重建索引
  _store._activeIdx = {}
  for (var i = 0; i < _store.dicts.length; i++) {
    _store._activeIdx[_store.dicts[i].name] = i
  }
  _store._mergedDirty = true
  persist()
  callback({ success: true })
}

// 创建空白词典
function createDict(name, callback) {
  if (!name) {
    callback({ success: false, error: '请输入词典名' })
    return
  }
  if (_store._activeIdx[name] !== undefined) {
    callback({ success: false, error: '词典名已存在' })
    return
  }
  var dict = {
    name: name,
    source: 'custom',
    enabled: true,
    words: []
  }
  buildIndex(dict)
  _store.dicts.push(dict)
  _store._activeIdx[name] = _store.dicts.length - 1
  _store._mergedDirty = true
  persist()
  callback({ success: true })
}

// 向自定义词典添加词条
function addWord(dictName, word, translation, phonetic, callback) {
  var idx = _store._activeIdx[dictName]
  if (idx === undefined) {
    callback({ success: false, error: '词典不存在' })
    return
  }
  var d = _store.dicts[idx]
  if (d.source === 'builtin') {
    callback({ success: false, error: '内置词典不可编辑' })
    return
  }
  var wl = (word || '').toLowerCase().trim()
  if (!wl || !translation) {
    callback({ success: false, error: '单词和翻译不能为空' })
    return
  }
  // 去重
  if (d._wordMap[wl] !== undefined) {
    callback({ success: false, error: '词条已存在' })
    return
  }
  var entry = {
    id: (d.words || []).length + 1,
    word: word.trim(),
    phonetic: phonetic || '',
    translation: translation.trim(),
    forms: []
  }
  d.words.push(entry)
  buildIndex(d)
  _store._mergedDirty = true
  persist()
  callback({ success: true })
}

// 删除词条
function deleteWord(dictName, word, callback) {
  var idx = _store._activeIdx[dictName]
  if (idx === undefined) {
    callback({ success: false, error: '词典不存在' })
    return
  }
  var d = _store.dicts[idx]
  if (d.source === 'builtin') {
    callback({ success: false, error: '内置词典不可编辑' })
    return
  }
  var wl = word.toLowerCase()
  var wi = d._wordMap[wl]
  if (wi === undefined) {
    callback({ success: false, error: '词条不存在' })
    return
  }
  d.words.splice(wi, 1)
  buildIndex(d)
  _store._mergedDirty = true
  persist()
  callback({ success: true })
}

// 获取词典详情（含词条列表）
function getDictDetail(name, callback) {
  var idx = _store._activeIdx[name]
  if (idx === undefined) {
    callback({ success: false, error: '词典不存在' })
    return
  }
  var d = _store.dicts[idx]
  callback({
    success: true,
    name: d.name,
    source: d.source,
    enabled: d.enabled !== false,
    wordCount: (d.words || []).length,
    words: d.words
  })
}

// ===== 搜索算法（基于合并词典） =====

function search(query, words, limit) {
  if (!query || !words || !words.length) return { exact: [], fuzzy: [] }
  query = String(query).toLowerCase().trim()
  if (!query) return { exact: [], fuzzy: [] }
  limit = limit || 50

  // 从合并词典中获取
  rebuildMerged()
  var dict = _store._merged
  if (!dict) return { exact: [], fuzzy: [] }

  var wm = dict._wordMap || {}
  var fm = dict._formMap || {}
  var allWords = dict.words || []

  var exact = []
  var seen = {}

  // 1. 精确匹配（变形词先查→回退到原词）
  addMatch(fm[query], allWords, exact, seen, 'exact')
  // 2. 精确匹配原词
  addMatch(wm[query], allWords, exact, seen, 'exact')
  // 3. 前缀匹配
  for (var i = 0; i < allWords.length && exact.length < limit; i++) {
    if (seen[i]) continue
    var wl = (allWords[i].word || '').toLowerCase()
    if (wl.indexOf(query) === 0) {
      seen[i] = true
      exact.push(allWords[i])
    }
  }
  // 4. 包含匹配
  for (var j = 0; j < allWords.length && exact.length < limit; j++) {
    if (seen[j]) continue
    var wl2 = (allWords[j].word || '').toLowerCase()
    if (wl2.indexOf(query) > 0) {
      seen[j] = true
      exact.push(allWords[j])
    }
  }
  // 5. 中文释义包含
  for (var k = 0; k < allWords.length && exact.length < limit; k++) {
    if (seen[k]) continue
    var trans = (allWords[k].translation || '').toLowerCase()
    if (trans.indexOf(query) > -1) {
      seen[k] = true
      exact.push(allWords[k])
    }
  }

  // 6. 模糊搜索（编辑距离≤1，不同于已有结果）
  var fuzzy = []
  if (query.length >= 2) {
    for (var m = 0; m < allWords.length && fuzzy.length < 10; m++) {
      if (seen[m]) continue
      var wl3 = (allWords[m].word || '').toLowerCase()
      if (editDistance(query, wl3) <= 1) {
        seen[m] = true
        fuzzy.push(allWords[m])
      }
    }
    // 也检查变形词表
    if (fuzzy.length < 5) {
      for (var n = 0; n < allWords.length && fuzzy.length < 10; n++) {
        if (seen[n]) continue
        var forms = allWords[n].forms || []
        for (var p = 0; p < forms.length && fuzzy.length < 10; p++) {
          if (editDistance(query, (forms[p] || '').toLowerCase()) <= 1) {
            seen[n] = true
            fuzzy.push(allWords[n])
            break
          }
        }
      }
    }
  }

  return { exact: exact, fuzzy: fuzzy }
}

function addMatch(idx, words, result, seen, tag) {
  if (idx !== undefined && idx !== null && !seen[idx]) {
    seen[idx] = true
    result.push(words[idx])
  }
}

// 编辑距离（Levenshtein，优化版）
function editDistance(a, b) {
  if (a === b) return 0
  var alen = a.length, blen = b.length
  if (alen === 0) return blen
  if (blen === 0) return alen
  var diff = alen - blen
  if (diff < 0) diff = -diff
  if (diff > 1) return diff // 快速剪枝
  var prev = []
  for (var i = 0; i <= blen; i++) prev[i] = i
  for (var i2 = 1; i2 <= alen; i2++) {
    var curr = [i2]
    for (var j = 1; j <= blen; j++) {
      var cost = a[i2 - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = curr
  }
  return prev[blen]
}

// 单词变形搜索（公开API，供页面查询变形词）
function searchForms(query, callback) {
  rebuildMerged()
  var dict = _store._merged
  if (!dict) { callback({ success: false }); return }
  var fm = dict._formMap || {}
  var wm = dict._wordMap || {}
  var words = dict.words || []
  var ql = (query || '').toLowerCase().trim()
  // 先查变形索引
  var fi = fm[ql]
  if (fi !== undefined) {
    callback({ success: true, baseWord: words[fi], isForm: true })
    return
  }
  // 再查原词索引
  var wi = wm[ql]
  if (wi !== undefined) {
    callback({ success: true, baseWord: words[wi], isForm: false })
    return
  }
  callback({ success: false })
}

// 显示 toast
function showToast(msg) {
  prompt.showToast({ message: msg })
}

// ===== interconnect 接收 =====
var importState = {
  phase: 'idle',
  name: '',
  received: 0,
  total: 0,
  chunks: [],
  error: '',
  dict: null
}
var importListeners = []

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
  var snap = cloneState()
  for (var i = 0; i < importListeners.length; i++) {
    try { importListeners[i](snap) } catch (e) {}
  }
}

function handleInterconnectMessage(msgStr) {
  var frame
  try { frame = JSON.parse(msgStr) } catch (e) {
    importState.phase = 'error'
    importState.error = '收到无法解析的帧'
    notifyListeners()
    return
  }
  if (!frame || !frame.type) return

  if (frame.type === 'connected') {
    importState.phase = 'connected'
    importState.error = ''
    notifyListeners()
    return
  }

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
    importState.chunks[frame.index] = frame.content || ''
    importState.received = importState.received + 1
    notifyListeners()
    return
  }

  if (frame.type === 'end') {
    if (importState.phase !== 'receiving') return
    var fullText = ''
    for (var i = 0; i < importState.chunks.length; i++) {
      if (importState.chunks[i] !== undefined && importState.chunks[i] !== null) {
        fullText += importState.chunks[i]
      }
    }
    var dict
    try { dict = JSON.parse(fullText) } catch (e) {
      importState.phase = 'error'
      importState.error = '词典 JSON 解析失败'
      importState.chunks = []
      notifyListeners()
      return
    }
    if (!dict || !dict.words || !Array.isArray(dict.words)) {
      importState.phase = 'error'
      importState.error = '词典格式不符：缺少 words 数组'
      importState.chunks = []
      notifyListeners()
      return
    }
    // 合并到词典管理器
    dict.source = 'user'
    dict.enabled = true
    // 与内置词典去重合并
    mergeUserDict(dict, function (res) {
      if (res.success) {
        importState.phase = 'done'
        importState.dict = dict
        importState.chunks = []
        notifyListeners()
      } else {
        importState.phase = 'error'
        importState.error = res.error || '合并失败'
        importState.chunks = []
        notifyListeners()
      }
    })
    return
  }
}

// 合并用户词典：同名覆盖，新词追加
function mergeUserDict(dict, callback) {
  if (!_store) init()
  var existingIdx = _store._activeIdx[dict.name]
  if (existingIdx !== undefined) {
    // 覆盖已有用户词典
    var old = _store.dicts[existingIdx]
    if (old.source === 'builtin') {
      callback({ success: false, error: '不能覆盖内置词典' })
      return
    }
    // 保留旧词典中的自定义词条
    var oldWords = old.words || []
    var newWords = dict.words || []
    var oldMap = {}
    for (var i = 0; i < oldWords.length; i++) {
      oldMap[(oldWords[i].word || '').toLowerCase()] = oldWords[i]
    }
    for (var j = 0; j < newWords.length; j++) {
      var wl = (newWords[j].word || '').toLowerCase()
      if (!oldMap[wl]) {
        oldWords.push(newWords[j])
      }
    }
    dict.words = oldWords
    dict.source = old.source
    _store.dicts[existingIdx] = dict
    buildIndex(dict)
  } else {
    // 新词典
    buildIndex(dict)
    _store.dicts.push(dict)
    _store._activeIdx[dict.name] = _store.dicts.length - 1
  }
  _store._mergedDirty = true
  persist()
  callback({ success: true })
}

// 重置导入状态
function resetImportState() {
  importState = { phase: 'idle', name: '', received: 0, total: 0, chunks: [], error: '', dict: null }
  notifyListeners()
}

// ===== 导出 =====
export default {
  // 词典管理
  init: init,
  getActiveDict: getActiveDict,
  getAllDicts: getAllDicts,
  toggleDict: toggleDict,
  deleteDict: deleteDict,
  createDict: createDict,
  addWord: addWord,
  deleteWord: deleteWord,
  getDictDetail: getDictDetail,
  // 搜索
  search: search,
  searchForms: searchForms,
  showToast: showToast,
  // interconnect
  handleInterconnectMessage: handleInterconnectMessage,
  onImportStatus: function (fn) {
    importListeners.push(fn)
    try { fn(cloneState()) } catch (e) {}
    return function () {
      var i = importListeners.indexOf(fn)
      if (i >= 0) importListeners.splice(i, 1)
    }
  },
  resetImportState: resetImportState,
  // 常量
  USER_DICT_URI: DICT_STORE_URI,
  ACTIVE_DICT_KEY: ACTIVE_DICT_KEY
}