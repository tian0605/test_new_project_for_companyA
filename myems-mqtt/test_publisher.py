# pyright: reportUnknownVariableType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownParameterType=false, reportAssignmentType=false, reportAttributeAccessIssue=false

from datetime import datetime
import json
import random
import time

from decouple import config
import paho.mqtt.client as mqtt


g_connected = False


def on_connect(client, userdata, connect_flags, reason_code, properties):
    global g_connected
    g_connected = reason_code == 0
    if g_connected:
        print('MQTT connected OK')
    else:
        print('Bad MQTT connection reason code=', reason_code)


def on_disconnect(client, userdata, disconnect_flags, reason_code, properties):
    global g_connected
    g_connected = False
    print('Disconnected reason code ' + str(reason_code))


def main():
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id='MYEMS-MQTT-TEST-' + datetime.utcnow().strftime('%Y%m%d%H%M%S'),
        clean_session=None,
        userdata=None,
        protocol=mqtt.MQTTv5,
        transport='tcp',
        reconnect_on_failure=True,
        manual_ack=False,
    )

    username = config('MYEMS_MQTT_TEST_BROKER_USERNAME', default='')
    password = config('MYEMS_MQTT_TEST_BROKER_PASSWORD', default='')
    if username:
        client.username_pw_set(username, password)

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.connect_async(
        config('MYEMS_MQTT_TEST_BROKER_HOST', default='127.0.0.1'),
        config('MYEMS_MQTT_TEST_BROKER_PORT', default=1883, cast=int),
        60,
    )
    client.loop_start()

    topic = config('MYEMS_MQTT_TEST_TOPIC', default='testtopic')
    qos = config('MYEMS_MQTT_TEST_QOS', default=0, cast=int)
    data_source_id = config('MYEMS_MQTT_TEST_DATA_SOURCE_ID', default=10001, cast=int)
    point_id = config('MYEMS_MQTT_TEST_POINT_ID', default=10001, cast=int)

    while True:
        if g_connected:
            payload = json.dumps(
                {
                    'data_source_id': data_source_id,
                    'point_id': point_id,
                    'utc_date_time': datetime.utcnow().isoformat(timespec='seconds'),
                    'value': round(random.uniform(10, 100), 3),
                }
            )
            print('payload=' + payload)
            client.publish(topic, payload=payload, qos=qos, retain=False)
        else:
            print('MQTT Client Connection error')
        time.sleep(1)


if __name__ == '__main__':
    main()