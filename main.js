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
		this.log.info("config host: " + this.config.host);
		this.log.info("config username: " + this.config.username);
		this.log.info("config password: " + this.config.password);
		this.log.info("info interval: " + this.config.infoInterval);
		this.log.info("param interval: " + this.config.paramInterval);

		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		await this.setObjectNotExistsAsync("connectionState", {
			type: "state",
			common: {
				name: "connectionState",
				type: "boolean",
				role: "indicator",
				read: true,
				write: true,
			},
			native: {},
		});

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		// this.subscribeStates("connectionState");
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates("lights.*");
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		// this.subscribeStates("*");

		/*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
		// the variable testVariable is set to true as command (ack=false)
		await this.setStateAsync("connectionState", true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		await this.setStateAsync("connectionState", { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		await this.setStateAsync("connectionState", { val: true, ack: true, expire: 30 });

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
      this.subscribeObjects("*");
      
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
         this.refreshTokenInterval = setInterval(() => {
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
      this.log.info("hostname = " + this.config.host);
      this.log.info("username = " + this.config.username);
      this.log.info("password = " + this.config.password);

      const smaUrl = "https://" + this.config.host + "/api/v1/token";
      this.log.info("Login URL = "+smaUrl);

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
      this.log.info("Fetch Info URL = "+smaUrl);

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
             this.log.info(JSON.stringify(response.data));
             this.setState("info.connection", true, true);
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

   }

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
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
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.info(`object ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
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
