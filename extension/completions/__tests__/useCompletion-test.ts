import { renderHook, act } from "@testing-library/react-hooks";

import useCompletion from "../useCompletion";

test("useCompletion", async () => {
  fetchMock.mockResponse(
    JSON.stringify({
      completion: "as np",
    })
  );

  const { result } = renderHook(() =>
    useCompletion({
      accessToken: "foo",
      enqueueSnackbar: jest.fn(),
      invalidateAccessToken: jest.fn(),
      prompt: "import numpy ",
    })
  );

  expect(result.current).toEqual(null);

  await act(() => {
    jest.runAllTicks();
  });

  expect(result.current).toEqual("as np");
});
