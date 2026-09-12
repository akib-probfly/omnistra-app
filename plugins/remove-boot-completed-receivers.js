const { withAndroidManifest } = require('@expo/config-plugins');

// Android 15+ forbids BOOT_COMPLETED receivers from launching restricted
// foreground service types (microphone, mediaPlayback, mediaProjection, ...).
// Play flags this app because two library receivers listen for boot while the
// DEX contains restricted FGS starters (expo-audio recording/playback,
// react-native-webrtc screen share). Those services are only ever started from
// user-initiated foreground flows, never from boot — verified by tracing:
//  - NotificationsService on boot only reschedules alarms, and this app only
//    ever schedules trigger:null (immediate) notifications, so there is
//    nothing to restore after a reboot.
//  - TaskBroadcastReceiver on boot only warms the in-memory task registry;
//    TaskService lazily restores persisted tasks on any later instantiation
//    (every FCM push / job run), and the app's only background task is the
//    FCM-driven call-push task.
// Re-declaring both receivers with tools:node="replace" drops the boot
// actions from the merged manifest while keeping NOTIFICATION_EVENT,
// the task-manager explicit intent, and MY_PACKAGE_REPLACED intact.
const RECEIVER_OVERRIDES = [
  {
    name: 'expo.modules.notifications.service.NotificationsService',
    attrs: {
      'android:enabled': 'true',
      'android:exported': 'false',
    },
    actions: [
      'expo.modules.notifications.NOTIFICATION_EVENT',
      'android.intent.action.MY_PACKAGE_REPLACED',
    ],
  },
  {
    name: 'expo.modules.taskManager.TaskBroadcastReceiver',
    attrs: {
      'android:exported': 'false',
    },
    actions: [
      'expo.modules.taskManager.TaskBroadcastReceiver.INTENT_ACTION',
      'android.intent.action.MY_PACKAGE_REPLACED',
    ],
  },
];

function buildReceiverNode({ name, attrs, actions }) {
  return {
    $: {
      'android:name': name,
      ...attrs,
      'tools:node': 'replace',
    },
    'intent-filter': [
      {
        action: actions.map((actionName) => ({
          $: { 'android:name': actionName },
        })),
      },
    ],
  };
}

function upsertReceiverOverride(receivers, override) {
  const index = receivers.findIndex(
    (receiver) => receiver?.$?.['android:name'] === override.name,
  );
  const node = buildReceiverNode(override);
  if (index >= 0) {
    receivers[index] = node;
  } else {
    receivers.push(node);
  }
}

module.exports = function removeBootCompletedReceivers(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const application = configWithManifest.modResults.manifest.application?.[0];
    if (!application) return configWithManifest;

    application.receiver = application.receiver ?? [];
    RECEIVER_OVERRIDES.forEach((override) =>
      upsertReceiverOverride(application.receiver, override),
    );

    return configWithManifest;
  });
};
