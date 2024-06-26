import { pullRequestBranch } from "../src/action";
import { describe, expect, test } from "@jest/globals";

describe("pullRequestBranch", () => {
  test("returns the expected branch names", () => {
    expect(pullRequestBranch("dev", "terraform-aws-vpc")).toEqual("patcher-dev-updates-terraform-aws-vpc");
  });
});
