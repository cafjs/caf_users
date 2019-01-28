
/**
 * @global
 * @typedef {function(Error?, any?)} cbType
 *
 */

/**
 * @global
 * @typedef {number} userType The number of units left.
 */

/**
 * @global
 * @typedef {number} appType The allowed time in seconds per unit.
 */

/**
 * @global
 * @typedef {number} caType The expire date in seconds from 1970/01/01.
 */


/**
 * @global
 * @typedef {Object} userInfoType
 * @property {userType} user User account info for the owner of this CA.
 * @property {Object.<string, appType>} apps All apps registered by this user.
 * @property {Object.<string, caType>} cas All CAs owned by this user.
 */

/**
 * @global
 * @typedef {Object} redisType
 * @property {number} port A port number for the service.
 * @property {string} hostname A host address for the service.
 * @property {string=} password A password for the service.
 */

/**
 * @global
 * @typedef {Object} changesType
 * @property {number} version An initial version number for the map.
 * @property {Array.<string>} remove Map keys to delete.
 * @property {Array.<Object>} add  Key/value pairs to add to the map. They are
 * laid out in the array as [key1, val1, key2, val2, ...
 */

/**
 * @global
 * @typedef {Object} specType
 * @property {string} name
 * @property {string|null} module
 * @property {string=} description
 * @property {Object} env
 * @property {Array.<specType>=} components
 *
 */

/**
 * @global
 * @typedef {Object} specDeltaType
 * @property {string=} name
 * @property {(string|null)=} module
 * @property {string=} description
 * @property {Object=} env
 * @property {Array.<specType>=} components
 *
 */

/**
 * @global
 * @typedef {Object.<string, Object>} ctxType
 */
