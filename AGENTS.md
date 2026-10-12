<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Job status transitions and who may change which fields are enforced by a database trigger (enforce_job_update) plus RLS, never only in the UI — clients can call the API directly. SMS requirement is toggled via public.phone_required() and PHONE_REQUIRED in the UI.
