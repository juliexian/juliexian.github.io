# juliexian.github.io

Personal academic site built with [Quarto](https://quarto.org). Pushing to `main` builds, checks and publishes it.

## Common edits

| To change | Edit |
|---|---|
| About, research, education | `index.qmd` |
| Publications (shared with the CV) | `_includes/papers.md`, `_includes/abstracts.md` |
| Updates | `updates.qmd` |
| CV page | `cv.qmd`, and replace the PDF as below |
| Photo, role, links, email | `_includes/profile.html` |
| Menu | `_quarto.yml` |
| Colors | `theme-dark.scss`, `theme-light.scss` |

## Adding a photo or PDF

Put the original in `_incoming/`, which git ignores, then strip its metadata into `assets/`:

```sh
scripts/add-file.sh _incoming/my-photo.heic headshot.jpg
scripts/add-file.sh _incoming/my-cv.pdf cv.pdf
```

Never copy files straight into `assets/`. Stripping metadata does not change what a document says, so anything printed in it, such as a phone number, will be public.

## Preview and check

```sh
~/.local/bin/quarto preview
~/.local/bin/quarto render && scripts/check-site.sh
```

The same check runs before every publish. A failure stops the publish.

## Writing a blog post

Copy `posts/_post-template.qmd` to a new name with no leading underscore, such as `posts/first-post.qmd`, and write your post. It appears on the Blog page newest first. Files that start with an underscore are never published, so the template stays private.

## Security rules

- Keep the site static, with no forms, comments, analytics or third-party scripts.
- Show only your school email, and only in the `[at]` and `[dot]` form.
- Never commit credentials. Anything committed stays in the public history even after you delete it.
