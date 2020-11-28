
/**
 * @global
 * @typedef {function(Error?, any=):void} cbType
 *
 */

/**
 * @global
 * @typedef {number} userType The number of units left.
 */

/**
 * @global
 * @typedef {Object} appType
 * @property {number} cost The allowed time in seconds per unit.
 * @property {number} expires  The registration expire date in
 * days from 1970/01/01.
 * @property {string} plan The strategy to increase resources with a new CA.
 * @property {number} profit The ratio of a unit that the app writer gets.
 */

/**
 * @global
 * @typedef {number} caType The CA expire date in days from 1970/01/01.
 */

/**
 * @global
 * @typedef {string} transferIdType A unique identifier for a transfer.
 */

/**
 * @global
 * @typedef {Object} orderType
 * @property {string} id An identifier for the order.
 * @property {string} user The requesting user.
 * @property {number} units Number of units requested.
 * @property {number} value Total cost in dollars.
 */

/**
 * @global
 * @typedef {Object} transferType
 * @property {number} expires The expire date in milliseconds from 1970/01/01.
 * @property {string} from The user that initiated the transfer.
 * @property {string} to The user that will receive the transfer.
 * @property {number} units The number of units transferred.
 * @property {boolean} released Whether the initiator released the transfer.
 */

/**
 * @global
 * @typedef {Object} reputationType
 * @property {string} joined A formatted date when the user registered.
 * @property {number} completed Number of successfully completed transfers.
 * @property {number} disputed Number of disputed transfers.
 * @property {number} expired Number of expired transfers.
 */

/**
 * @global
 * @typedef {Object} statsType
 * @property {string} appName The name of the app.
 * @property {number} timestamp Time the measure was taken in msec since 1970.
 * @property {number} count Number of active CAs at the time for that app.
 */

/**
 * @global
 * @typedef {Object} userInfoType
 * @property {userType} user User account info for the owner of this CA.
 * @property {Object.<string, appType>} apps All apps registered by this user.
 * @property {Object.<string, caType>} cas All CAs owned by this user.
 * @property {Object.<transferIdType, transferType>} offers All pending
 * transfers initiated by this user.
 * @property {Object.<transferIdType, transferType>} accepts Pending transfers
 * to be accepted or rejected by this user.
 * @property {reputationType} reputation The reputation stats for this user.
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
