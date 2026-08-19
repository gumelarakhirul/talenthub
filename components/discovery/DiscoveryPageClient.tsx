"use client";

import { useState, useRef, useEffect, type SyntheticEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { showAlertValidationError, showAlertSuccess } from "@/lib/alert";
import Link from "next/link";

const SortIcon = () => <span className="text-gray-400 text-xs ml-1">⇅</span>;

// Tipe data
type Creator = {
  no: number;
  name: string;
  username: string;
  photo_url: string | null;
  followers: string;
  post: string;
  er: string;
  avrView: string;
  avrBrand: string;
  cpvAll: string;
  cpvBranded: string;
  social_media: string;
  tier: string;
  gender: string;
  city_id: number | null;
  category_id: number | null;
  followersRaw: number;
};

const DEFAULT_DISCOVERY_FILTERS = [
  { id: "social_media", label: "Social Media", options: ["Instagram", "TikTok"] },
  { id: "tier", label: "Tier", options: ["Nano", "Micro", "Macro", "Mega"] },
  { id: "category", label: "Category", options: [] },
  { id: "city", label: "City", options: [] },
  { id: "gender", label: "Gender", options: ["Male", "Female"] },
];

function profilePhotoSource(value: string | null): string {
  const url = String(value ?? "").trim();
  if (!url) return "/image/default-kol-avatar.png";
  if (url.startsWith("/") || url.startsWith("data:image/")) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

function handleProfilePhotoError(
  event: SyntheticEvent<HTMLImageElement>,
  databaseUrl: string | null,
) {
  const image = event.currentTarget;
  const rawUrl = String(databaseUrl ?? "").trim();

  if (/^https?:\/\//i.test(rawUrl) && image.dataset.directTried !== "true") {
    image.dataset.directTried = "true";
    image.src = rawUrl;
    return;
  }

  if (!image.src.endsWith("/image/default-kol-avatar.png")) {
    image.src = "/image/default-kol-avatar.png";
  }
}

export default function CreatorDiscoveryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // --- MODE EDIT: dideteksi dari query ?projectId=xxx ---
  const projectId = searchParams.get("projectId");
  const isEditMode = Boolean(projectId);

  // ID creator yang sudah ada di project ini (untuk disembunyikan dari list)
  const [existingCreatorIds, setExistingCreatorIds] = useState<number[]>([]);

  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const [dynamicFilters, setDynamicFilters] = useState<any[]>(DEFAULT_DISCOVERY_FILTERS);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [filterError, setFilterError] = useState("");
  const [filterReload, setFilterReload] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage, setEntriesPerPage] = useState(10);

  const [brandsOptions, setBrandsOptions] = useState<
    { id: string; name: string }[]
  >([]);

  const [isFiltered, setIsFiltered] = useState(true);

  const [creatorsData, setCreatorsData] = useState<Creator[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>(
    {}
  );

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [otherInputs, setOtherInputs] = useState<Record<string, string>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const refreshedPhotoPages = useRef(new Set<string>());

  // --- STATES MODAL ADD PROJECT (hanya dipakai kalau BUKAN edit mode) ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpenDropdownId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadDropdownFilters() {
      setLoadingFilters(true);
      setFilterError("");
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const res = await fetch("/api/filter", {
            cache: "no-store",
            signal: controller.signal,
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(data?.error ?? "Failed to load filters");
          if (!Array.isArray(data)) throw new Error("Invalid filter response");
          if (!controller.signal.aborted) {
            const loadedById = new Map(data.map((filter: any) => [filter.id, filter]));
            setDynamicFilters(DEFAULT_DISCOVERY_FILTERS.map((fallback) => {
              const loaded = loadedById.get(fallback.id) as any;
              return loaded ? { ...fallback, ...loaded } : fallback;
            }));
          }
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          lastError = error instanceof Error ? error : new Error("Failed to load filters");
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 600));
        }
      }

      if (!controller.signal.aborted) setFilterError(lastError?.message ?? "Failed to load filters");
    }
    void loadDropdownFilters().finally(() => {
      if (!controller.signal.aborted) setLoadingFilters(false);
    });
    return () => controller.abort();
  }, [filterReload]);

  useEffect(() => {
    async function loadBrands() {
      try {
        const res = await fetch("/api/discovery/brand");
        if (res.ok) {
          const data = await res.json();
          setBrandsOptions(data);
        }
      } catch (error) {
        console.error("Error fetching brands:", error);
      }
    }
    loadBrands();
  }, []);

  // --- BARU: kalau edit mode, ambil creator yang SUDAH ada di project ---
  useEffect(() => {
    if (!isEditMode || !projectId) return;

    async function loadExistingCreators() {
      try {
        const res = await fetch(`/api/tracking/detail?projectId=${projectId}`);
        if (res.ok) {
          const data = await res.json();
          const ids = (data.creators || []).map((c: any) => c.creatorId);
          setExistingCreatorIds(ids);
        }
      } catch (error) {
        console.error("Error fetching existing project creators:", error);
      }
    }

    loadExistingCreators();
  }, [isEditMode, projectId]);

  useEffect(() => {
    async function fetchCreators() {
      try {
        const params = new URLSearchParams();
        Object.entries(appliedFilters).forEach(([key, val]) => {
          if (val) params.append(key, val);
        });

        const res = await fetch(`/api/discovery?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setCreatorsData(data);
        }
      } catch (error) {
        console.log("Error fetching creators:", error);
      }
    }
    fetchCreators();
  }, [appliedFilters]);

  const handleSelectOption = (id: string, value: string) => {
    setFilters((prev) => ({ ...prev, [id]: value }));
    setOpenDropdownId(null);
  };

  const handleAddCustomOption = async (id: string) => {
    const customValue = otherInputs[id]?.trim();

    if (!customValue) {
      showAlertValidationError("Input cannot be empty!");
      return;
    }

    const targetFilter = dynamicFilters.find((f) => f.id === id);
    if (
      targetFilter &&
      targetFilter.options?.some(
        (opt: string | { id: string; name: string }) =>
          (typeof opt === "string" ? opt : opt.name).toLowerCase() === customValue.toLowerCase()
      )
    ) {
      showAlertValidationError(
        "This option already exists in the filter list!"
      );
      return;
    }

    try {
      const res = await fetch("/api/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: id, value: customValue }),
      });

      const result = await res.json();

      if (!res.ok) {
        showAlertValidationError(result.error || "Failed to save data.");
        return;
      }

      const newOption = {
        id: String(result.data.id),
        name: String(result.data.name),
      };
      setDynamicFilters((prevFilters) =>
        prevFilters.map((f) => {
          if (f.id === id) {
            return { ...f, options: [...f.options, newOption] };
          }
          return f;
        })
      );

      setFilters((prev) => ({ ...prev, [id]: newOption.id }));
      setOtherInputs((prev) => ({ ...prev, [id]: "" }));
      showAlertSuccess(`"${customValue}" successfully added!`);
    } catch (error) {
      showAlertValidationError("A connection error occurred.");
    }
  };

  const handleApplyFilter = () => {
    setAppliedFilters(filters);
    setIsFiltered(true);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setAppliedFilters({});
    setOtherInputs({});
    setIsFiltered(true);
    setSelectedRows([]);
    setCurrentPage(1);
  };

  const toggleSelect = (no: number) => {
    setSelectedRows((prev) =>
      prev.includes(no) ? prev.filter((id) => id !== no) : [...prev, no]
    );
  };

  const filteredCreators = creatorsData.filter((creator) => {
    // --- BARU: sembunyikan creator yang sudah ada di project (mode edit) ---
    if (isEditMode && existingCreatorIds.includes(creator.no)) {
      return false;
    }

    if (!isFiltered) return true;

    if (
      appliedFilters.social_media &&
      creator.social_media?.toLowerCase() !==
        appliedFilters.social_media?.toLowerCase()
    ) {
      return false;
    }

    if (appliedFilters.tier) {
      const count = creator.followersRaw ?? 0;
      if (appliedFilters.tier.startsWith("Nano")) {
        if (count < 1000 || count >= 10000) return false;
      } else if (appliedFilters.tier.startsWith("Micro")) {
        if (count < 10000 || count >= 100000) return false;
      } else if (appliedFilters.tier.startsWith("Macro")) {
        if (count < 100000 || count >= 1000000) return false;
      } else if (appliedFilters.tier.startsWith("Mega")) {
        if (count < 1000000) return false;
      }
    }

    if (
      appliedFilters.gender &&
      creator.gender?.toLowerCase() !== appliedFilters.gender?.toLowerCase()
    ) {
      return false;
    }

    if (appliedFilters.category) {
      const matchId =
        creator.category_id?.toString() === appliedFilters.category;
      if (!matchId) return false;
    }

    if (appliedFilters.city) {
      const matchCityId = creator.city_id?.toString() === appliedFilters.city;
      if (!matchCityId) return false;
    }

    return true;
  });

  const totalEntries = filteredCreators.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = Math.min(startIndex + entriesPerPage, totalEntries);

  const currentData = filteredCreators.slice(startIndex, endIndex);
  const currentPhotoPageKey = currentData
    .map((creator) => creator.no)
    .sort((a, b) => a - b)
    .join(",");

  useEffect(() => {
    if (!currentPhotoPageKey || refreshedPhotoPages.current.has(currentPhotoPageKey)) return;
    refreshedPhotoPages.current.add(currentPhotoPageKey);
    const controller = new AbortController();

    async function refreshVisibleProfilePhotos() {
      try {
        const creatorIds = currentPhotoPageKey.split(",").map(Number);
        const response = await fetch("/api/discovery/profile-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creatorIds }),
          signal: controller.signal,
        });
        if (!response.ok) return;

        const result = await response.json() as {
          photos?: Array<{ id: number; photo_url: string | null }>;
        };
        const photos = new Map(
          (result.photos ?? [])
            .filter((item) => item.photo_url)
            .map((item) => [item.id, item.photo_url]),
        );
        if (!photos.size || controller.signal.aborted) return;

        setCreatorsData((previous) => previous.map((creator) => ({
          ...creator,
          photo_url: photos.get(creator.no) ?? creator.photo_url,
        })));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Failed to refresh profile photos:", error);
        }
      }
    }

    void refreshVisibleProfilePhotos();
    return () => controller.abort();
  }, [currentPhotoPageKey]);

  const toggleSelectAll = () => {
    const currentPageIds = currentData.map((item) => item.no);
    const isAllCurrentSelected = currentPageIds.every((id) =>
      selectedRows.includes(id)
    );

    if (isAllCurrentSelected) {
      setSelectedRows((prev) =>
        prev.filter((id) => !currentPageIds.includes(id))
      );
    } else {
      const newSelections = currentPageIds.filter(
        (id) => !selectedRows.includes(id)
      );
      setSelectedRows((prev) => [...prev, ...newSelections]);
    }
  };

  // --- LOGIC MODAL (khusus mode BUAT project baru) ---
  const handleOpenModal = () => {
    if (selectedRows.length === 0) {
      showAlertValidationError("Please Select Min 1 KOL");
      return;
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setProjectName("");
    setSelectedBrand("");
    setStartDate("");
    setEndDate("");
    setIsBrandDropdownOpen(false);
  };

  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectName || !selectedBrand || !startDate || !endDate) {
      showAlertValidationError("Please fill all project details!");
      return;
    }

    if (endDate < startDate) {
      showAlertValidationError("End Date cannot be earlier than Start Date.");
      return;
    }

    const selectedCreatorsData = creatorsData.filter((creator) =>
      selectedRows.includes(creator.no)
    );

    try {
      const res = await fetch("/api/discovery/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: projectName,
          brandId: selectedBrand,
          startDate: startDate,
          endDate: endDate,
          selectedCreators: selectedCreatorsData,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        showAlertValidationError(result.error || "Failed to save project.");
        return;
      }

      showAlertSuccess(
        `Project "${projectName}" successfully saved to database!`
      );

      setIsModalOpen(false);
      setProjectName("");
      setSelectedBrand("");
      setStartDate("");
      setEndDate("");
      setSelectedRows([]);
    } catch (error) {
      console.error("Connection error while submitting project:", error);
      showAlertValidationError(
        "A connection error occurred while saving the project."
      );
    }
  };

  // --- BARU: LOGIC UPDATE PROJECT (khusus mode EDIT, tambah creator ke project lama) ---
  const handleUpdateProject = async () => {
    if (selectedRows.length === 0) {
      showAlertValidationError("Please Select Min 1 KOL");
      return;
    }

    const selectedCreatorsData = creatorsData.filter((creator) =>
      selectedRows.includes(creator.no)
    );

    try {
      const res = await fetch(`/api/discovery/${projectId}/creators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedCreators: selectedCreatorsData }),
      });

      const result = await res.json();

      if (!res.ok) {
        showAlertValidationError(result.error || "Failed to update project.");
        return;
      }

      showAlertSuccess("Creator successfully added to the project!");
      setSelectedRows([]);

      // TODO: sesuaikan path ini dengan route halaman draft/tracking kamu
      router.push(`/tracking/detail?projectId=${projectId}&view=Draft`);
    } catch (error) {
      console.error("Connection error while updating project:", error);
      showAlertValidationError(
        "A connection error occurred while updating the project."
      );
    }
  };

  return (
    <section className="relative min-h-screen min-w-0 bg-slate-50 p-0 sm:p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {isEditMode ? "Add More Creators" : "Discovery"}
        </h1>
        <p className="text-sm text-slate-500">
          {isEditMode
            ? "Select additional creators to add to this project"
            : "Discover the right creators for your campaigns"}
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)] xl:gap-6">
        <div
          ref={dropdownRef}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"
        >
          <h2 className="font-bold mb-4">Filter</h2>

          {loadingFilters ? (
            <div className="text-sm text-slate-400 text-center py-6 italic animate-pulse">
              Loading filters from database...
            </div>
          ) : filterError && dynamicFilters.length === 0 ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center">
              <p className="text-xs font-medium text-rose-700">{filterError}</p>
              <button
                type="button"
                onClick={() => setFilterReload((value) => value + 1)}
                className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {dynamicFilters.map((filter) => (
                <div key={filter.id} className="relative">
                  <label className="block text-sm font-medium mb-1 text-slate-700">
                    {filter.label}
                  </label>

                  <div
                    onClick={() =>
                      setOpenDropdownId(
                        openDropdownId === filter.id ? null : filter.id
                      )
                    }
                    className={`w-full h-10 border rounded-lg px-3 flex items-center justify-between text-sm cursor-pointer transition-colors ${
                      openDropdownId === filter.id
                        ? "border-blue-500 ring-2 ring-blue-50"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    <span
                      className={
                        filters[filter.id] ? "text-slate-900" : "text-slate-400"
                      }
                    >
                      {(() => {
                        const selectedValue = filters[filter.id];
                        if (!selectedValue) return `Select ${filter.label}`;

                        const foundOption = filter.options?.find(
                          (opt: string | { id: string; name: string }) =>
                            typeof opt === "object"
                              ? opt.id === selectedValue
                              : opt === selectedValue
                        );

                        if (
                          typeof foundOption === "object" &&
                          foundOption !== null
                        ) {
                          return foundOption.name;
                        }

                        return selectedValue;
                      })()}
                    </span>

                    <svg
                      className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
                        openDropdownId === filter.id ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>

                  {openDropdownId === filter.id && (
                    <div className="absolute z-40 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      <div className="py-1">
                        {filter.options?.map(
                          (option: string | { id: string; name: string }) => {
                            const isObject =
                              typeof option === "object" && option !== null;
                            const optionValue = isObject ? option.id : option;
                            const optionLabel = isObject ? option.name : option;

                            return (
                              <div
                                key={optionValue}
                                onClick={() =>
                                  handleSelectOption(filter.id, optionValue)
                                }
                                className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                                  filters[filter.id] === optionValue
                                    ? "bg-blue-50 text-blue-600 font-medium"
                                    : "hover:bg-slate-50 text-slate-700"
                                }`}
                              >
                                {optionLabel}
                              </div>
                            );
                          }
                        )}
                      </div>

                      {(filter.id === "category" || filter.id === "city") && (
                        <div className="border-t border-slate-100 p-2 bg-slate-50 sticky bottom-0">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              placeholder="Others..."
                              value={otherInputs[filter.id] || ""}
                              onChange={(e) =>
                                setOtherInputs((prev) => ({
                                  ...prev,
                                  [filter.id]: e.target.value,
                                }))
                              }
                              className="flex-1 h-8 border border-slate-300 rounded px-2 text-xs bg-white focus:outline-none focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddCustomOption(filter.id)}
                              className="w-8 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center justify-center font-bold text-lg transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={handleApplyFilter}
                className="w-full bg-black text-white py-2 rounded-lg font-medium text-sm mt-2 hover:bg-gray-800 transition-colors"
              >
                Apply Filter
              </button>
              <button
                onClick={clearFilters}
                className="w-full border border-slate-300 py-2 rounded-lg font-medium text-sm hover:bg-slate-50 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-5 lg:p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Result Discovery
            </h1>
            <p className="text-gray-500">Creator Found</p>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-3 sm:gap-4">
            {selectedRows.length > 0 && (
              <div className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium text-sm">
                <span>{selectedRows.length} selected</span>
                <button
                  onClick={() => setSelectedRows([])}
                  className="hover:bg-blue-700 p-1 rounded-full"
                >
                  ×
                </button>
              </div>
            )}
            {/* --- BARU: tombol berubah tergantung mode --- */}
            <button
              onClick={isEditMode ? handleUpdateProject : handleOpenModal}
              className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-gray-800 transition-colors"
            >
              <span>+</span> {isEditMode ? "Update Project" : "Add to Project"}
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm mb-4">
            <span>Show</span>
            <select
              value={entriesPerPage}
              onChange={(e) => {
                setEntriesPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1 bg-white cursor-pointer focus:outline-none focus:border-blue-500"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>entries</span>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg w-full max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200 text-left sticky top-0 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">
                  <th className="p-3 w-12 border-r border-gray-200 text-center bg-gray-100">
                    <input
                      type="checkbox"
                      checked={
                        currentData.length > 0 &&
                        currentData.every((item) =>
                          selectedRows.includes(item.no)
                        )
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                  {[
                    "No.",
                    "Photo",
                    "Influencer Name",
                    "Username",
                    "Post",
                    "Followers",
                    "ER",
                    "Avr View",
                    "Action detail",
                  ].map((head) => (
                    <th
                      key={head}
                      className="p-3 border-r border-gray-200 font-semibold text-gray-700 whitespace-nowrap bg-gray-100"
                    >
                      <div className="flex items-center justify-between">
                        <span>{head}</span>
                        <SortIcon />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentData.map((row, i) => (
                  <tr
                    key={row.no}
                    className="border-b border-gray-200 hover:bg-gray-50 text-gray-800"
                  >
                    <td className="p-3 border-r border-gray-200 text-center">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(row.no)}
                        onChange={() => toggleSelect(row.no)}
                      />
                    </td>
                    <td className="p-3 border-r border-gray-200 text-center">
                      {startIndex + i + 1}
                    </td>
                    <td className="p-3 border-r border-gray-200 text-center">
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-blue-100 flex items-center justify-center mx-auto">
                        <img
                          src={profilePhotoSource(row.photo_url)}
                          alt={`${row.name} profile`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(event) => handleProfilePhotoError(event, row.photo_url)}
                        />
                      </div>
                    </td>
                    <td className="p-3 border-r border-gray-200 font-medium whitespace-nowrap">
                      {row.name}
                    </td>
                    <td className="p-3 border-r border-gray-200 text-gray-500 whitespace-nowrap">
                      {row.username}
                    </td>
                    <td className="p-3 border-r border-gray-200 whitespace-nowrap">
                      {row.post}
                    </td>
                    <td className="p-3 border-r border-gray-200 whitespace-nowrap">
                      {row.followers}
                    </td>
                    <td className="p-3 border-r border-gray-200 whitespace-nowrap">
                      {row.er}
                    </td>
                    <td className="p-3 border-r border-gray-200 whitespace-nowrap">
                      {row.avrView}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <button
                        onClick={() =>
                          router.push(`/tracking/detail/detail/${row.no}`)
                        }
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-full transition-colors inline-flex items-center justify-center"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="w-5 h-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
                {currentData.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="p-8 text-center text-gray-400 italic"
                    >
                      {isEditMode
                        ? "Semua creator yang tersedia sudah ada di project ini, atau coba ubah filter."
                        : "No data available. Please select and apply filters to discover creators."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <span>
              Showing {totalEntries > 0 ? startIndex + 1 : 0} to {endIndex} of{" "}
              {totalEntries} entries
            </span>

            {totalPages > 1 && (
              <div className="flex border border-gray-200 rounded-md overflow-hidden items-center bg-white">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-gray-100 border-r border-gray-200 disabled:opacity-50 hover:bg-gray-200"
                >
                  Previous
                </button>

                {(() => {
                  const pageNumbers = [];
                  const siblings = 1;

                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
                  } else {
                    const showLeftDots = currentPage > 3;
                    const showRightDots = currentPage < totalPages - 2;

                    if (!showLeftDots && showRightDots) {
                      for (let i = 1; i <= 5; i++) pageNumbers.push(i);
                      pageNumbers.push("...");
                      pageNumbers.push(totalPages);
                    } else if (showLeftDots && !showRightDots) {
                      pageNumbers.push(1);
                      pageNumbers.push("...");
                      for (let i = totalPages - 4; i <= totalPages; i++)
                        pageNumbers.push(i);
                    } else if (showLeftDots && showRightDots) {
                      pageNumbers.push(1);
                      pageNumbers.push("...");
                      for (
                        let i = currentPage - siblings;
                        i <= currentPage + siblings;
                        i++
                      ) {
                        pageNumbers.push(i);
                      }
                      pageNumbers.push("...");
                      pageNumbers.push(totalPages);
                    }
                  }

                  return pageNumbers.map((page, index) => {
                    if (page === "...") {
                      return (
                        <span
                          key={`dots-${index}`}
                          className="px-3 py-1 border-r border-gray-200 bg-gray-50 text-gray-400 select-none"
                        >
                          ...
                        </span>
                      );
                    }

                    return (
                      <button
                        key={`page-${page}`}
                        type="button"
                        onClick={() =>
                          typeof page === "number" && setCurrentPage(page)
                        }
                        className={`px-3 py-1 border-r border-gray-200 transition-colors ${
                          page === currentPage
                            ? "bg-blue-50 font-bold text-blue-600"
                            : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  });
                })()}

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(p + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- MODAL CREATE NEW PROJECT: hanya tampil kalau BUKAN edit mode --- */}
      {!isEditMode && isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#E9B35A] px-5 py-3.5 flex items-center justify-between text-white">
              <h3 className="font-semibold text-base tracking-wide text-center flex-1 ml-6">
                Create New Project
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-black hover:bg-black/10 rounded-lg p-1 text-xl font-bold transition-colors w-7 h-7 flex items-center justify-center leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitProject} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Fill Project Name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm focus:outline-none focus:border-blue-500 bg-white placeholder-slate-400"
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Brand <span className="text-red-500">*</span>
                </label>
                <div
                  onClick={() => setIsBrandDropdownOpen(!isBrandDropdownOpen)}
                  className={`w-full h-10 border rounded-lg px-3 flex items-center justify-between text-sm cursor-pointer transition-colors ${
                    isBrandDropdownOpen
                      ? "border-blue-500 ring-2 ring-blue-50"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  <span
                    className={
                      selectedBrand ? "text-slate-900" : "text-slate-400"
                    }
                  >
                    {brandsOptions.find((b) => b.id === selectedBrand)?.name ||
                      "Choose Brand"}
                  </span>
                  <svg
                    className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
                      isBrandDropdownOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>

                {isBrandDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {brandsOptions.map(
                      (brand: { id: string; name: string }) => (
                        <div
                          key={brand.id}
                          onClick={() => {
                            setSelectedBrand(brand.id);
                            setIsBrandDropdownOpen(false);
                          }}
                          className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                            selectedBrand === brand.id
                              ? "bg-blue-50 text-blue-600 font-medium"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          {brand.name}
                        </div>
                      )
                    )}
                    {brandsOptions.length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-400 italic text-center">
                        No brands available
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      const nextStartDate = e.target.value;
                      setStartDate(nextStartDate);

                      if (endDate && endDate < nextStartDate) {
                        setEndDate("");
                      }
                    }}
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm focus:outline-none focus:border-blue-500 bg-white text-slate-700 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full h-10 border border-slate-300 rounded-lg px-3 text-sm focus:outline-none focus:border-blue-500 bg-white text-slate-700 uppercase"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-black text-white h-11 rounded-lg font-medium text-sm mt-2 hover:bg-gray-800 transition-colors active:scale-[0.99]"
              >
                Add To Project
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
