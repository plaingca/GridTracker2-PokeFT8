const mqtt = require('mqtt');

GT.pskMqttClient = null;
GT.pskMqttUrl = "mqtt://mqtt.pskreporter.info:1883";
GT.pskCloseTimer = null;

function openPskMqtt()
{
    if (GT.pskCloseTimer != null)
    {
        nodeTimers.clearTimeout(GT.pskCloseTimer);
        GT.pskCloseTimer = null;
    }

    if (GT.spotView == 0 || GT.settings.app.spottingEnable == false)
    {
        GT.pskCloseTimer = nodeTimers.setTimeout(closePskMqtt, 60000);
        return;
    }

    if (GT.pskMqttClient != null) return;

    if (GT.settings.map.offlineMode == true) return;

    if (GT.settings.app.myCall == null || GT.settings.app.myCall == "NOCALL" || GT.settings.app.myCall == "") return;

    const dottedCallsign = GT.settings.app.myCall.replaceAll("/", ".");
    const clientId = `GT2_${dottedCallsign}_${GT.settings.app.myGrid}_${Math.random().toString(16).slice(3)}`;
    const topic = `pskr/filter/v2/+/+/${dottedCallsign}/#`;

    GT.pskMqttClient = mqtt.connect(GT.pskMqttUrl, {
        clientId,
        clean: true,
        connectTimeout: 30000,
        reconnectPeriod: 90000,
    });

    GT.pskMqttClient.on('connect', () => {
        GT.pskMqttClient.subscribe([topic], (err) => {
            if (err) console.error("PSKReporter MQTT Subscribe Error:", err);
        })
    });
    
    GT.pskMqttClient.on('message', (topic, payload) => {
          try {
            const spotData = JSON.parse(payload.toString());
            addNewMqttPskSpot(spotData);
        } catch (err) {
            console.error("Failed to parse PSKReporter MQTT payload:", err);
        }
    });
        

    GT.pskMqttClient.on('error', (err) => {
        console.error("PSKReporter MQTT Error:", err.message);
    });
}

function closePskMqtt()
{
    if (GT.pskCloseTimer != null)
    {
        nodeTimers.clearTimeout(GT.pskCloseTimer);
        GT.pskCloseTimer = null;
    }

    if (GT.pskMqttClient != null)
    {
        GT.pskMqttClient.end();
        GT.pskMqttClient = null;
    }
}