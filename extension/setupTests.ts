import mockFetch from "jest-fetch-mock";

jest.useFakeTimers();
jest.mock("rooks", () => {
  return {
    useDebounce: (fn: unknown) => fn,
  };
});

mockFetch.enableMocks();
