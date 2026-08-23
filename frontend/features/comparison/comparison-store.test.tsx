import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useComparisonSelection } from "./comparison-store";

describe("comparison store", () => {
  beforeEach(() => {
    const { result, unmount } = renderHook(() => useComparisonSelection());
    act(() => result.current.clear());
    unmount();
  });

  it("keeps an ordered session selection and toggles an existing listing", () => {
    const { result } = renderHook(() => useComparisonSelection());
    act(() => {
      expect(result.current.toggle(7)).toBe("added");
      expect(result.current.toggle(9)).toBe("added");
    });
    expect(result.current.listingIds).toEqual([7, 9]);

    act(() => expect(result.current.toggle(7)).toBe("removed"));
    expect(result.current.listingIds).toEqual([9]);
  });

  it("enforces the four-listing limit and clears the selection", () => {
    const { result } = renderHook(() => useComparisonSelection());
    act(() => {
      [1, 2, 3, 4].forEach((id) => result.current.toggle(id));
    });
    expect(result.current.count).toBe(4);
    act(() => expect(result.current.toggle(5)).toBe("limit"));
    expect(result.current.listingIds).toEqual([1, 2, 3, 4]);
    act(() => result.current.clear());
    expect(result.current.listingIds).toEqual([]);
  });
});
