import { RuntimeLoadProfileService } from "./runtime-load-profile.service";

const containerMocks: Array<{
  id: string;
  start: jest.Mock<Promise<void>>;
  wait: jest.Mock<Promise<{ StatusCode: number }>>;
  remove: jest.Mock<Promise<void>>;
}> = [];

const spawnSyncMock = jest.fn();
const spawnMock = jest.fn(() => ({
  on: jest.fn(),
}));

const createContainerMock = jest.fn().mockImplementation(async () => {
  const container = {
    id: `mock-container-${containerMocks.length}`,
    start: jest.fn().mockResolvedValue(undefined),
    wait: jest.fn().mockResolvedValue({ StatusCode: 0 }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  containerMocks.push(container);
  return container;
});

const DockerMock = jest.fn().mockImplementation(() => ({
  createContainer: createContainerMock,
}));

jest.mock("dockerode", () => DockerMock);
jest.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

const defaultCreateContainerImplementation = async () => {
  const container = {
    id: `mock-container-${containerMocks.length}`,
    start: jest.fn().mockResolvedValue(undefined),
    wait: jest.fn().mockResolvedValue({ StatusCode: 0 }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  containerMocks.push(container);
  return container;
};

describe("RuntimeLoadProfileService (dockerode)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    containerMocks.length = 0;
    createContainerMock.mockClear();
    createContainerMock.mockImplementation(
      defaultCreateContainerImplementation
    );
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: "mock-cli-container",
      stderr: "",
    });
    spawnMock.mockReset();
    spawnMock.mockReturnValue({ on: jest.fn() });
    (DockerMock as jest.Mock).mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("starts and stops containers when stress mode is enabled", async () => {
    process.env.STRESS_USE_DOCKER_WORKERS = "true";
    process.env.STRESS_DISABLE = "false";
    process.env.STRESS_MAX_WORKERS = "2";

    const svc = new RuntimeLoadProfileService();

    await expect(svc.setProfile(100, 1)).resolves.not.toThrow();

    // With max workers = 2, we should create two containers.
    expect(createContainerMock).toHaveBeenCalledTimes(2);

    // Stopping the profile should remove the containers.
    await svc.setProfile(10, 1);

    for (const container of containerMocks) {
      expect(container.remove).toHaveBeenCalled();
    }
  });

  it("cleans up partially started containers when a subsequent container fails", async () => {
    process.env.STRESS_USE_DOCKER_WORKERS = "true";
    process.env.STRESS_DISABLE = "false";
    process.env.STRESS_MAX_WORKERS = "2";

    // First container succeeds, second container fails.
    const original = createContainerMock.getMockImplementation() as
      | (() => Promise<(typeof containerMocks)[number]>)
      | undefined;
    let callCount = 0;
    createContainerMock.mockImplementation(async () => {
      if (callCount === 0) {
        callCount += 1;
        if (!original) {
          throw new Error("missing container mock implementation");
        }
        return original();
      }
      throw new Error("simulated container start failure");
    });

    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "simulated container start failure",
    });

    const svc = new RuntimeLoadProfileService();
    await expect(svc.setProfile(100, 1)).rejects.toThrow(
      "simulated container start failure"
    );

    // First container should be cleaned up.
    expect(containerMocks[0].remove).toHaveBeenCalled();
  });

  it("does not start workers when STRESS_DISABLE is true", async () => {
    process.env.STRESS_USE_DOCKER_WORKERS = "true";
    process.env.STRESS_DISABLE = "true";

    const svc = new RuntimeLoadProfileService();
    await expect(svc.setProfile(100, 1)).resolves.not.toThrow();

    expect(createContainerMock).not.toHaveBeenCalled();
  });

  it("auto-reverts after max duration", async () => {
    process.env.STRESS_USE_DOCKER_WORKERS = "true";
    process.env.STRESS_DISABLE = "false";
    process.env.STRESS_MAX_WORKERS = "1";
    process.env.STRESS_MAX_DURATION = "1";

    jest.useFakeTimers({ now: 0 });

    const svc = new RuntimeLoadProfileService();
    await expect(svc.setProfile(100, 1)).resolves.not.toThrow();

    expect(createContainerMock).toHaveBeenCalledTimes(1);

    // Fast-forward past the max duration timer
    jest.advanceTimersByTime(1500);
    await Promise.resolve();

    // Ensure the worker got removed via auto-revert
    expect(containerMocks[0].remove).toHaveBeenCalled();

    jest.useRealTimers();
  });
});
