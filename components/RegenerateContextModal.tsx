"use client";

import React from "react";
import { Icon, icons } from "./Icon";
import { Modal } from "./Modal";

type RegenerateContextModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (context: string) => void;
  title: string;
  description: string;
  placeholder?: string;
  isLoading?: boolean;
};

export function RegenerateContextModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  placeholder = "e.g. Make it more conversational, add a stronger CTA, focus on the technical audience…",
  isLoading = false,
}: RegenerateContextModalProps) {
  const [context, setContext] = React.useState("");
  const [clicked, setClicked] = React.useState(false);

  React.useEffect(() => {
    if (!open) setClicked(false);
  }, [open]);

  const handleConfirm = () => {
    if (isLoading || clicked) return;
    setClicked(true);
    onConfirm(context.trim());
    setContext("");
  };

  const handleClose = () => {
    setContext("");
    setClicked(false);
    onClose();
  };

  const busy = isLoading || clicked;

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <div style={{ padding: "0 24px 24px" }}>
        <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 16, lineHeight: 1.5 }}>
          {description}
        </p>
        <div className="form-group">
          <label className="form-label">Additional context (optional)</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={placeholder}
            rows={4}
            style={{
              width: "100%",
              fontSize: 14,
              padding: 12,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              resize: "vertical",
            }}
            disabled={busy}
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 20,
          }}
        >
          <button
            className="btn btn-secondary"
            onClick={handleClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? (
              <>Regenerating…</>
            ) : (
              <>
                <Icon d={icons.spark} size={14} /> Regenerate
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
