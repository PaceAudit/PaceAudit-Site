"use client";

import React from "react";
import { Icon, icons } from "./Icon";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button
            className="btn btn-ghost"
            style={{ padding: "4px 8px" }}
            onClick={onClose}
          >
            <Icon d={icons.x} size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
