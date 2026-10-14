import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect } from "vitest";
import { Button, Modal, Confirm } from "./ui";
function Harness() {
  const [detail, setDetail] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Button onClick={() => setDetail(true)}>Open detail</Button>
      <Modal
        open={detail}
        title="Image review"
        description="Review details"
        onClose={() => setDetail(false)}
      >
        <Button onClick={() => setConfirm(true)}>Approve</Button>
      </Modal>
      <Confirm
        open={confirm}
        title="Confirm approval"
        description="Validate checks"
        busy={false}
        onClose={() => setConfirm(false)}
        onConfirm={() => setConfirm(false)}
      />
    </>
  );
}
it("Escape closes only the top dialog and restores focus in order", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Open detail" }));
  await user.click(
    within(screen.getByRole("dialog", { name: "Image review" })).getByRole(
      "button",
      { name: "Approve" },
    ),
  );
  expect(
    screen.getByRole("dialog", { name: "Confirm approval" }),
  ).toBeVisible();
  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("dialog", { name: "Confirm approval" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Image review" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Approve" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open detail" })).toHaveFocus();
});
