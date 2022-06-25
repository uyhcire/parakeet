import fs from "fs";

import {
  getLineDisplayInfoForColab,
  getLineDisplayInfoForJupyter,
} from "../Completion";

test("getLineDisplayInfoForColab", () => {
  document.body.innerHTML = fs.readFileSync(
    `${process.env.PROJECT_ROOT}/testdata/colab_snapshot.html`,
    "utf8"
  );

  expect(getLineDisplayInfoForColab(2, 1)).toBeTruthy();
});

test("getLineDisplayInfoForJupyter", () => {
  document.body.innerHTML = fs.readFileSync(
    `${process.env.PROJECT_ROOT}/testdata/jupyter_snapshot.html`,
    "utf8"
  );

  expect(getLineDisplayInfoForJupyter(2, 0)).toBeTruthy();
});
