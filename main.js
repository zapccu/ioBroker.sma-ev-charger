// @ts-nocheck
"use strict";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

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
		this.on("unload", this.onUnload.bind(this));

		this.session = {};
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {

		// The REST client
		this.requestClient = axios.create();

		// Reset the connection indicator during startup
		this.setState("info.connection", false, true);

		// Subscribe to changes
		this.subscribeStates("*");

		// Initial login
		let loggedIn = false;
		if (!this.session.access_token) {
			if(this.config.host && this.config.username && this.config.password) {
				this.log.info("Initial login");
				loggedIn = await this.login();
			} else {
				this.log.error("Please configure adapter parameters host, username and password before starting the adapter");
			}
		} else {
			loggedIn = true;
		}

		if (loggedIn && this.session.access_token) {
			// Login successful, setup timer functions

			const refreshInterval = this.session.expires_in ? this.session.expires_in-60 : 3600;
			this.log.info("Token refresh interval = " + refreshInterval + " seconds");

			// Timer for refreshing the access token
			this.refreshTokenInterval = setInterval(async () => {
				await this.refreshToken();
			}, refreshInterval * 1000);

			// Create objects
			await this.updateChargerInformation(true);
			await this.updateChargerParameters(true);

			// Timer for updating the wallbox information
			if (this.config.infoInterval > 0) {
				this.updateInfoInterval = setInterval(async () => {
					await this.updateChargerInformation(false);
				}, this.config.infoInterval * 1000);
			}

			// Timer for updating the wallbox configuration
			if (this.config.paramInterval > 0) {
				this.updateParamInterval = setInterval(async () => {
					await this.updateChargerParameters(false);
				}, this.config.paramInterval * 1000);
			}
		} else {
			this.log.error("Not logged in");
		}
	}

	//
	// Login to wallbox
	//
	async login() {

		const smaUrl = "https://" + this.config.host + "/api/v1/token";

		const data = {
			grant_type: "password",
			username: this.config.username,
			password: this.config.password
		};

		try {
			const response = await this.requestClient({
				url: smaUrl,
				method: "POST",
				headers: {
					accept: "*/*"
				},
				data: qs.stringify(data)
			});

			this.session = response.data;
			this.setState("info.connection", true, true);
			this.setState("info.status", "logged in", true);
			this.log.info(`Connected to ${this.config.host} `);
			return true;
		}
		catch(error) {
			this.setState("info.connection", false, true);
			this.setState("info.status", "login failed", true);
			this.log.error("login request failed");
			error.response && this.log.error(JSON.stringify(error.response.data));
			return false;
		}
	}

	//
	// Refresh the access token
	//
	async refreshToken() {

		this.log.info("Refreshing token");

		const smaUrl = "https://" + this.config.host + "/api/v1/token";

		const data = {
			grant_type: "refresh_token",
			refresh_token: this.session.refresh_token
		};

		try {
			const response = await this.requestClient({
				url: smaUrl,
				method: "POST",
				headers: {
					accept: "*/*"
				},
				data: qs.stringify(data)
			});

			this.session = response.data;
			this.setState("info.connection", true, true);
			this.setState("info.status", "token refreshed", true);
			this.log.info(`Connected to ${this.config.host} `);
		}
		catch(error) {
			this.setState("info.connection", false, true);
			this.setState("info.status", "refresh token failed", true);
			this.log.error("refresh token failed");
			error.response && this.log.error(JSON.stringify(error.response.data));
		}
	}

	//
	// Refresh the charger information
	//
	async updateChargerInformation(createFlag) {

		createFlag && this.log.info("Initial update of charger information");

		const smaUrl = "https://" + this.config.host + "/api/v1/measurements/live";

		const body = [
			{
				"componentId": "IGULD:SELF"
			}
		];

		try {
			const response = await this.requestClient({
				url: smaUrl,
				method: "POST",
				headers: {
					"Authorization": "Bearer " + this.session.access_token,
					"Accept": "*/*",
					"Content-Type": "application/json"
				},
				data: JSON.stringify(body)
			});

			this.log.debug("Charger info: " + JSON.stringify(response.data));

			this.setState("info.connection", true, true);
			this.setState("info.status", "OK", true);

			response.data.forEach(async(element) => {
				await this.setChargerObjectValue(createFlag, element, element.values[0].value);
			});
		}
		catch(error) {
			this.setState("info.connection", false, true);
			this.setState("info.status", "update failed", true);
			this.log.error("update information failed");
			error.response && this.log.error(JSON.stringify(error.response.data));
		}
	}

	//
	// Refresh the charger parameters
	//
	async updateChargerParameters(createFlag) {

		createFlag && this.log.info("Initial update of charger parameters");

		const smaUrl = "https://" + this.config.host + "/api/v1/parameters/search/";

		const body = {
			"queryItems": [ { "componentId": "IGULD:SELF" } ]
		};

		try {
			const response = await this.requestClient({
				url: smaUrl,
				method: "POST",
				headers: {
					"Authorization": "Bearer " + this.session.access_token,
					"Accept": "*/*",
					"Content-Type": "application/json"
				},
				data: JSON.stringify(body)
			});

			this.log.debug("Charger parameters: " + JSON.stringify(response.data));

			this.setState("info.connection", true, true);
			this.setState("info.status", "OK", true);

			response.data[0].values.forEach(async(element) => {
				await this.setChargerObjectValue(createFlag, element, element.value);
			});
		}
		catch(error) {
			this.setState("info.connection", false, true);
			this.setState("info.status", "update failed", true);
			this.log.error("update parameters failed");
			error.response && this.log.error(JSON.stringify(error.response.data));
		}
	}

	//
	// Create object and update state
	//
	async setChargerObjectValue(createFlag, element, value) {

		const elementObjects = element.channelId.split(".");
		const channel = elementObjects.shift().toLowerCase();

		// Remove invalid characters from datapoint name and build object path
		const datapoint = elementObjects.join("").replace(/[^a-zA-Z0-9-_]/g, "");
		const objPath = channel + "." + datapoint;

		if(createFlag) {
			const editable = element.editable || false;
			const objDef = {
				type: "state",
				common: {
					name: datapoint,
					type: "string",
					role: "text",
					read: true,
					write: editable
				},
				native: {
					channelId: element.channelId
				}
			};

			// Adjust parameter type (default is string)
			if(!isNaN(value)) {
				objDef.common.type = "number";
				objDef.common.role = "value";
			}

			const obj = await this.getObjectAsync(objPath);
			if(obj) {
				// Store list of possible values for enumerations. Keep existing states.
				if(element.possibleValues && !obj.common.states) {
					objDef.common.states = element.possibleValues;
				}
				objDef.native = { channelId: element.channelId };

				// Modify/extend existing object
				await this.extendObjectAsync(objPath, objDef);
			} else {
				// Store list of possible values for enumerations
				if(element.possibleValues) {
					objDef.common.states = element.possibleValues;
				}
				// Create new object
				await this.setObjectNotExistsAsync(objPath, objDef);
			}
		}

		// Set object state
		value != null && this.setState(objPath, isNaN(value) ? value : Number(value), true);
	}

	//
	// Set charger parameter
	//
	async setChargerParameter(smaChannelId, newValue) {

		const smaUrl = "https://" + this.config.host + "/api/v1/parameters/IGULD:SELF";

		const body = {
			"values": [
				{
					"channelId": smaChannelId,
					"value": newValue
				}
			]
		};

		try {
			await this.requestClient({
				url: smaUrl,
				method: "PUT",
				headers: {
					"Authorization": "Bearer " + this.session.access_token,
					"Accept": "*/*",
					"Content-Type": "application/json"
				},
				data: JSON.stringify(body)
			});

			this.setState("info.connection", true, true);
			this.setState("info.status", "OK", true);
		}
		catch(error) {
			this.setState("info.connection", false, true);
			this.setState("info.status", "set parameter failed", true);
			this.log.error("set parameter failed");
			error.response && this.log.error(JSON.stringify(error.response.data));
		}
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

			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state changed
			if(state.ack === false) {
				// The state was changed by the user. Update charger parameter
				this.getObject(id, (err,obj) => {
					if(err) {
						this.log.error("Object not found " + id);
					} else {
						// this.log.info("obj = " + JSON.stringify(obj));
						if(obj.native.channelId) {
							this.log.info("Set charger parameter for channelId " + obj.native.channelId + " to " + state.val);
							this.setChargerParameter(obj.native.channelId, state.val);
						} else {
							this.setState("info.status", "set parameter failed", true);
							this.log.error("Channel id not found in object " + id + " object=" + JSON.stringify(obj));
						}
					}
				});
			}
		} else {
			// The state was deleted
			// this.log.info(`on state ${id} deleted`);
		}
	}

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
