import core from '@actions/core';
import { run } from './action';

(async () => {
  try {
    await run();
  } catch (e) {
    core.setFailed(`Action failed with "${e}"`);
  }
})();