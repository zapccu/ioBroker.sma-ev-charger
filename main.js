// @ts-nocheck
"use strict";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

const axios = require("axios");
const qs = require("qs");

class SmaEvCharger extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "sma-ev-charger",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));

      this.session = {};
	}

   /**
    * Is called when databases are connected and adapter received configuration.
    */
   async onReady() {
      // Initialize your adapter here

      // Reset the connection indicator during startup
      this.setState("info.connection", false, true);

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:

      // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
      // this.subscribeStates("connectionState");
      // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
      // this.subscribeStates("lights.*");
      // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
      // this.subscribeStates("*");

      // examples for the checkPassword/checkGroup functions
      // let result = await this.checkPasswordAsync("admin", "iobroker");
      // this.log.info("check user admin pw iobroker: " + result);

      // result = await this.checkGroupAsync("admin", "admin");
      // this.log.info("check group user admin group admin: " + result);

      this.adapterConfig = "system.adapter." + this.name + "." + this.instance;
      const obj = await this.getForeignObjectAsync(this.adapterConfig);
      if (this.config.reset) {
         if (obj) {
            obj.native.session = {};
            await this.setForeignObjectAsync(this.adapterConfig, obj);
            this.log.info("Login Token resetted");
            this.terminate();
         }
      }

      this.requestClient = axios.create();

      if (obj && obj.native.session && obj.native.session.refresh_token) {
         this.session = obj.native.session;
         this.log.info("Session loaded");
         this.log.info("Refresh session");
         await this.refreshToken(true);
      }

      // Todo: Is this needed?
      this.reLoginTimeout = null;
      this.refreshTokenTimeout = null;

      // Subscribe to changes
      this.subscribeStates("*");
      // this.subscribeObjects("*");
      
      // Initial login
      if (!this.session.access_token) {
         this.log.info("Initial login");
         await this.login();
      }

      if (this.session.access_token) {
         // Login successful, setup timer functions

         const refreshInterval = this.session.expires_in ? this.session.expires_in : 3600;
         this.log.info("Token refresh interval = " + refreshInterval + " seconds");

         // Timer for refreshing the access token
         this.refreshTokenInterval = setInterval(async () => {
            await this.refreshToken();
         }, refreshInterval * 1000);

         // Timer for updating the wallbox information
         if (this.config.infoInterval > 0) {
            this.updateInfoInterval = setInterval(async () => {
               await this.updateChargerInformation();
            }, this.config.infoInterval * 1000);
         }

         // Timer for updating the wallbox configuration
         if (this.config.paramInterval > 0) {
            this.updateParamInterval = setInterval(async () => {
               await this.updateChargerParameters();
            }, this.config.paramInterval * 1000);
         }
      }
   }

   //
   // Login to wallbox
   //
   async login() {

      const smaUrl = "https://" + this.config.host + "/api/v1/token";
      // this.log.info("Login URL = "+smaUrl);

      const data = {
         grant_type: "password",
         username: this.config.username,
         password: this.config.password
      };
      
//      this.requestClient.interceptors.request.use(request => {
//         this.log.info(JSON.stringify(request, null, 2))
//         return request
//      });

      await this.requestClient({
         url: smaUrl,
         method: "POST",
         headers: {
             accept: "*/*"
         },
         data: qs.stringify(data)
      })
      .then((response) => {
         // this.log.info(JSON.stringify(response.data));
         this.session = response.data;
         this.setState("info.connection", true, true);
         this.log.info(`Connected to ${this.config.host} `);
      })
      .catch((error) => {
         this.log.error(error);
         error.response && this.log.error(JSON.stringify(error.response.data));
      });
   }

   //
   // Refresh the access token
   //
   async refreshToken() {
      this.log.info("Refreshing token");

      const smaUrl = "https://" + this.config.host + "/api/v1/token";
      this.log.info("Refresh URL = "+smaUrl);

      const data = {
         grant_type: "refresh_token",
         refresh_token: this.session.refresh_token
      };      
      await this.requestClient({
         url: smaUrl,
         method: "POST",
         headers: {
             accept: "*/*"
         },
         data: qs.stringify(data)
      })
      .then((response) => {
         this.log.info(JSON.stringify(response.data));
         this.session = response.data;
         this.setState("info.connection", true, true);
         this.log.info(`Connected to ${this.config.host} `);
      })
      .catch((error) => {
         this.log.error(error);
         error.response && this.log.error(JSON.stringify(error.response.data));
      });
   }

   //
   // Refresh the charger information
   //
   async updateChargerInformation() {
      this.log.info("Updating charger information");

      const smaUrl = "https://" + this.config.host + "/api/v1/measurements/live";
      // this.log.info("Fetch Info URL = "+smaUrl);

      const body = [ {"componentId": "IGULD:SELF"} ];
   
      await this.requestClient({
         url: smaUrl,
         method: "POST",
         headers: {
            "Authorization": "Bearer " + this.session.access_token, 
            "Accept": "*/*",
            "Content-Type": "application/json"
         },
         data: JSON.stringify(body)
      })
      .then((response) => {
         // this.log.info(JSON.stringify(response.data));
         this.setState("info.connection", true, true);
         
         response.data.forEach(async(element) => {
            await this.setChargerObject(element);
         });
      })
      .catch((error) => {
         this.log.error(error);
         error.response && this.log.error(JSON.stringify(error.response.data));
      });
   }

   //
   // Refresh the charger parameters
   //
   async updateChargerParameters() {
      this.log.info("Updating charger parameters");

      const smaUrl = "https://" + this.config.host + "/api/v1/parameters/search/";
      // this.log.info("Fetch Parameters URL = "+smaUrl);

      const body = {
         "queryItems": [ { "componentId": "IGULD:SELF" } ]
      }
   
      await this.requestClient({
         url: smaUrl,
         method: "POST",
         headers: {
            "Authorization": "Bearer " + this.session.access_token, 
            "Accept": "*/*",
            "Content-Type": "application/json"
         },
         data: JSON.stringify(body)
      })
      .then((response) => {
         // this.log.info(JSON.stringify(response.data));
         this.setState("info.connection", true, true);
         
         response.data[0].values.forEach(async(element) => {
            await this.setChargerObject(element);
         });
      })
      .catch((error) => {
         this.log.error(error);
         error.response && this.log.error(JSON.stringify(error.response.data));
      });
   }

   //
   // Create object and update state
   //
   async setChargerObject(element) {
      // const ts = Date.parse(element.timestamp);
      const val = element.value;
      const elementObjects = element.channelId.split(".");
      const channel = elementObjects.shift().toLowerCase();
      // Remove invalid characters from object path
      const datapoint = elementObjects.join("").replace(/[^a-zA-Z0-9-_]/g, "");
      const objPath = channel + "." + datapoint;
      const editable = element.editable || false;
      var objDef = {
         type: "state",
         common: {
            name: datapoint,
            type: "string",
            role: "text",
            read: true,
            write: editable
         },
         native: {}
      };

      // Store channel id for editable parameters
      objDef.common.custom = { "channelId": element.channelId };

      // Store list of possible values for enumerations
      if(element.possibleValues) {
         objDef.common.states = element.possibleValues;
      }

      // Adjust parameter type (default is string)
      if(!isNaN(val)) {
         objDef.common.type = "number";
         objDef.common.role = "value"
      }

      // Create object if it doesn't exist and update state
      await this.setObjectNotExistsAsync(objPath, objDef);
      val && this.setState(objPath, isNaN(val) ? val : Number(val), true);   
   }

   //
   // Set charger parameter
   //
   async setChargerParameter(smaChannelId, newValue) {
      const smaUrl = "https://" + this.config.host + "/api/v1/parameters/IGULD:SELF";

      const body = {
         "values": [
            { "channelId": smaChannelId },
            { "value": newValue }
         ]
      }

      await this.requestClient({
         url: smaUrl,
         method: "PUT",
         headers: {
            "Authorization": "Bearer " + this.session.access_token, 
            "Accept": "*/*",
            "Content-Type": "application/json"
         },
         data: JSON.stringify(body)
      })
      .then((response) => {
         // this.log.info(JSON.stringify(response.data));
         this.setState("info.connection", true, true);
      })
      .catch((error) => {
         this.log.error(error);
         error.response && this.log.error(JSON.stringify(error.response.data));
      });
   }

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
   onUnload(callback) {
		try {
         this.log.info("Cleaning up");

         this.setState("info.connection", false, true);
         
         this.updateInfoInterval && this.clearInterval(this.updateInfoInterval);
         this.updateParamInterval && this.clearInterval(this.updateParamInterval);
         this.refreshTokenInterval && this.clearInterval(this.refreshTokenInterval);

			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`on object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`on object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			// this.log.info(`on state ${id} changed: ${state.val} (ack = ${state.ack})`);
         if(state.ack === false) {
            // The state was changed by the user. Update charger parameter
            const obj = this.getObject(id);
            if(obj) {
               if(obj.common.custom.channelId) {
                  this.log.info("ack=false => setChargerParameter for id " + id + " channelId=" + obj.common.custom.channelId);
                  // this.setChargerParameter(obj.common.custom.channelId, state);   
               }
               else {
                  this.log.info("Channel id not found in object " + id)
               }
            }
            else {
               this.log.error("Object not found " + id);
            }
         }
		} else {
			// The state was deleted
			// this.log.info(`on state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new SmaEvCharger(options);
} else {
	// otherwise start the instance directly
	new SmaEvCharger();
}
