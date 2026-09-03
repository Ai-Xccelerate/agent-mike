"use client";
import { useModal } from "@/hooks/useModal";
import ComponentCard from "../../common/ComponentCard";

import Button from "../../ui/button/Button";
import { Modal } from "../../ui/modal";

export default function FullScreenModal() {
  const {
    isOpen: isFullscreenModalOpen,
    openModal: openFullscreenModal,
    closeModal: closeFullscreenModal,
  } = useModal();
  const handleSave = () => {
    // Handle save logic here
    console.log("Saving changes...");
    closeFullscreenModal();
  };
  return (
    <ComponentCard title="Full Screen Modal">
      <Button size="sm" onClick={openFullscreenModal}>
        Open Modal
      </Button>
      <Modal
        isOpen={isFullscreenModalOpen}
        onClose={closeFullscreenModal}
        isFullscreen={true}
        showCloseButton={true}
      >
        <div className="fixed top-0 left-0 flex flex-col justify-between w-full h-screen p-6 overflow-x-hidden overflow-y-auto bg-white dark:bg-gray-900 lg:p-10">
          <div>
            <h4 className="font-semibold text-gray-800 mb-7 text-title-sm dark:text-white/90">
              Weekly revenue summary
            </h4>
            <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
              Your AI revenue employees booked 47 meetings and generated
              $1,284,000 in new pipeline this week. Jules led outbound with 3,120
              emails sent and a 4.2% reply rate across the mid-market segment.
            </p>
            <p className="mt-5 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Pepper handled 92% of inbound conversations without escalation,
              qualifying 128 leads and routing 41 to the sales team. Nick&apos;s
              demand-gen campaigns drove 6,400 site visits and 312 new signups
              across paid and organic channels, with cost per lead down 18% from
              last month.
            </p>
            <p className="mt-5 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Joy advanced 18 deals to the proposal stage, while George flagged
              five accounts at renewal risk and opened a save play for each.
            </p>
          </div>
          <div className="flex items-center justify-end w-full gap-3 mt-8">
            <Button size="sm" variant="outline" onClick={closeFullscreenModal}>
              Close
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    </ComponentCard>
  );
}
