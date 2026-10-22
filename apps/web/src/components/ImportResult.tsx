import type { ImportResultDto } from "@nihongo/shared";
import { base64ToBlob, saveBlob } from "../lib/api";
import { Alert, Button, DataTable } from "./ui";

/** FR-3.3.4: imported count, each invalid row with its number and reason, and the .xlsx error report. */
export function ImportResultView({ result, noun }: { result: ImportResultDto; noun: string }) {
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {result.imported > 0 ? (
        <Alert tone="success" title={`Imported ${result.imported} ${noun}${result.imported === 1 ? "" : "s"}`}>
          {result.errors.length ? `${result.errors.length} row${result.errors.length === 1 ? " was" : "s were"} skipped. Fix them and upload those rows again.` : "Every row was imported."}
        </Alert>
      ) : (
        <Alert tone="danger" title="Nothing was imported">
          Every row has a problem. Fix the rows below and upload the file again.
        </Alert>
      )}
      {result.errors.length ? (
        <>
          <DataTable label="Rows that weren't imported" className="max-h-72">
            <thead>
              <tr>
                <th scope="col">Row</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {result.errors.map((e) => (
                <tr key={e.row}>
                  <td>{e.row}</td>
                  <td className="text-shu">{e.reason.replace(/^Row \d+: /, "")}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {result.errorReport ? (
            <div>
              <Button
                variant="secondary"
                icon="download"
                onClick={() => saveBlob(base64ToBlob(result.errorReport!, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "import-errors.xlsx")}
              >
                Download error report
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
