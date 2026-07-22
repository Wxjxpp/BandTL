/**
 * 词典数据管理模块
 * 负责：内置词典加载、用户词典导入/持久化、词典切换、本地搜索匹配
 * 适配 Vela 快应用 system.file / system.storage / system.fetch 接口
 */

import file from '@system.file'
import storage from '@system.storage'
import fetch from '@system.fetch'
import prompt from '@system.prompt'

// 持久化存储的文件 URI
const USER_DICT_URI = 'internal://files/user_dict.json'
const DICT_INDEX_URI = 'internal://files/dict_index.json'
const ACTIVE_DICT_KEY = 'active_dict_name'

/**
 * 读取内置词典（打包进 rpk 的资源，只读）
 * @param {Function} callback({success: Boolean, dict: Object, error: String})
 */
function loadBuiltinDict(callback) {
  file.readText({
    uri: '/Common/dict.json',
    success: function (data) {
      try {
        const dict = JSON.parse(data.text)
        dict.source = 'builtin'
        callback({ success: true, dict: dict })
      } catch (e) {
        callback({ success: false, error: '内置词典解析失败: ' + e })
      }
    },
    fail: function (data, code) {
      callback({ success: false, error: '读取内置词典失败 code=' + code })
    }
  })
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
 * 从网络 URL 下载词典并导入持久化
 * @param {String} url 词典 JSON 的 URL
 * @param {Function} callback({success: Boolean, dict: Object, error: String})
 */
function importFromUrl(url, callback) {
  fetch.fetch({
    url: url,
    responseType: 'json',
    success: function (response) {
      if (response.code !== 200) {
        callback({ success: false, error: '下载失败 HTTP ' + response.code })
        return
      }
      let dict = response.data
      // responseType=json 时 data 可能已是对象，也可能为字符串
      if (typeof dict === 'string') {
        try {
          dict = JSON.parse(dict)
        } catch (e) {
          callback({ success: false, error: '词典 JSON 格式错误' })
          return
        }
      }
      // 校验词典结构
      if (!dict || !dict.words || !Array.isArray(dict.words)) {
        callback({ success: false, error: '词典格式不符：缺少 words 数组' })
        return
      }
      dict.source = 'user'
      dict.importedAt = Date.now()
      saveUserDict(dict, function (res) {
        if (res.success) {
          // 记录为当前启用词典
          storage.set({ key: ACTIVE_DICT_KEY, value: dict.name || '用户词典' })
          callback({ success: true, dict: dict })
        } else {
          callback({ success: false, error: res.error })
        }
      })
    },
    fail: function (data, code) {
      callback({ success: false, error: '网络请求失败 code=' + code })
    }
  })
}

/**
 * 获取当前启用的词典（用户导入优先，无则回退内置）
 * @param {Function} callback({success: Boolean, dict: Object, error: String})
 */
function getActiveDict(callback) {
  loadUserDict(function (uRes) {
    if (uRes.success && uRes.dict) {
      callback({ success: true, dict: uRes.dict })
      return
    }
    // 无用户词典，使用内置
    loadBuiltinDict(function (bRes) {
      callback(bRes)
    })
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
  importFromUrl: importFromUrl,
  getActiveDict: getActiveDict,
  removeUserDict: removeUserDict,
  search: search,
  showToast: showToast,
  USER_DICT_URI: USER_DICT_URI,
  ACTIVE_DICT_KEY: ACTIVE_DICT_KEY
}
