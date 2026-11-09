// The home: the headline and a real form, then the featured comparison section by section when
// one is ready and kept. With none: the hero, the form, how it works, the close and the footer.
import type { ComparisonView } from "../../compare/read";
import {
  AskForm,
  Authorities,
  Close,
  FiguresSentence,
  Grid,
  Hero,
  HowItWorks,
  LawyerHome,
  ProvedItem,
  SavedList,
  Verdict,
  type HomeForm,
  type SavedRow,
} from "../components";
import { shortPlace } from "../format";
import { Bar, Footer, HOME_DESCRIPTION, HOME_TITLE, Layout } from "../layout";

export type { HomeForm };

export type HomeProps = {
  featured: ComparisonView | null;
  saved: SavedRow[];
  form: HomeForm;
};

export function Home(props: HomeProps) {
  const v = props.featured;
  const gridHref = v === null ? "#ask" : "#grid";
  const filled: HomeForm =
    props.form.error !== null || v === null
      ? props.form
      : {
          activity: props.form.activity !== "" ? props.form.activity : v.activity,
          place1: props.form.place1 !== "" ? props.form.place1 : shortPlace(v.places[0] ?? ""),
          place2: props.form.place2 !== "" ? props.form.place2 : shortPlace(v.places[1] ?? ""),
          place3: props.form.place3 !== "" ? props.form.place3 : shortPlace(v.places[2] ?? ""),
          error: null,
        };
  return (
    <Layout title={HOME_TITLE} description={HOME_DESCRIPTION}>
      <Bar gridHref={gridHref} askHref="#ask" />
      <main id="top">
        <Hero activity={v?.activity ?? null}>
          <AskForm {...filled} />
        </Hero>
        {v !== null ? (
          <>
            <Grid view={v} openable={false} />
            <Verdict view={v} />
            <ProvedItem view={v} />
            <Authorities view={v} />
          </>
        ) : null}
        <HowItWorks minutes={v?.research_minutes ?? null} />
        {v !== null ? (
          <>
            <FiguresSentence view={v} />
            <LawyerHome view={v} />
            <SavedList rows={props.saved} />
          </>
        ) : null}
        <Close />
      </main>
      <Footer gridHref={gridHref} />
    </Layout>
  );
}
