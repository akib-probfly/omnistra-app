const { withAndroidManifest } = require('@expo/config-plugins');

const APP_ACTIVITIES = new Set([
  '.MainActivity',
  'com.zurvis.mobile.MainActivity',
]);
const MLKIT_CODE_SCANNER_ACTIVITY = 'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';

function removeActivityOrientation(activity) {
  if (!activity || !activity.$) return;

  const activityName = activity.$['android:name'];
  if (!APP_ACTIVITIES.has(activityName)) return;

  delete activity.$['android:screenOrientation'];
}

function ensureMlkitOrientationOverride(activities) {
  const existing = activities.find(
    (activity) => activity?.$?.['android:name'] === MLKIT_CODE_SCANNER_ACTIVITY,
  );

  if (existing) {
    existing.$['tools:remove'] = mergeToolsRemove(existing.$['tools:remove']);
    return;
  }

  activities.push({
    $: {
      'android:name': MLKIT_CODE_SCANNER_ACTIVITY,
      'tools:remove': 'android:screenOrientation',
    },
  });
}

function mergeToolsRemove(value) {
  const removals = new Set(
    String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  removals.add('android:screenOrientation');
  return Array.from(removals).join(',');
}

module.exports = function removeAndroidLargeScreenRestrictions(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const application = configWithManifest.modResults.manifest.application?.[0];
    const activities = application?.activity ?? [];

    activities.forEach(removeActivityOrientation);
    ensureMlkitOrientationOverride(activities);

    return configWithManifest;
  });
};
