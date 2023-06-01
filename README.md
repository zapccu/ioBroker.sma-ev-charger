![Logo](admin/sma-ev-charger.png)
# ioBroker.sma-ev-charger

[![NPM version](https://img.shields.io/npm/v/iobroker.sma-ev-charger.svg)](https://www.npmjs.com/package/iobroker.sma-ev-charger)
[![Downloads](https://img.shields.io/npm/dm/iobroker.sma-ev-charger.svg)](https://www.npmjs.com/package/iobroker.sma-ev-charger)
![Number of Installations](https://iobroker.live/badges/sma-ev-charger-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/sma-ev-charger-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.sma-ev-charger.png?downloads=true)](https://nodei.co/npm/iobroker.sma-ev-charger/)

**Tests:** ![Test and Release](https://github.com/zapccu/ioBroker.sma-ev-charger/workflows/Test%20and%20Release/badge.svg)

## sma-ev-charger adapter for ioBroker

Adapter for SMA EV Charger wallbox

## Configuration

Status information and parameters are fetched periodically from charger. Intervals for status information and parameters can be configured individually. Set interval to 0 to deactivate automatic updates.

## Interesting datapoints

measurement.MeteringGridMsTotWInChaSta - Current charging power
measurement.MeteringGridMsTotWhInChaSta - Total charged

parameter.ChrgActChaMod - Set charging mode
parameter.ChrgAMinCha - Minimum charging current (smalles value is 6A)


## Changelog

### 0.1.4
* First functional release


## Credits

Many thanks to SMA for providing product images from SMA EV Charger.


## License
MIT License

Copyright (c) 2023 zapccu <d.braner@gmx.net>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.