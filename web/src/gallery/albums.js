// The gallery's content. Nothing here is fetched: there is no image backend, by design.
//
// TO ADD MORE PHOTOS
//   1. Put the file in web/src/assets/gallery/ as .jpg, .png or .webp (about 1600-2000px on the long side is plenty; strip
//      camera metadata). Use a .jpg extension, not .jpeg: the Node server only knows the .jpg content type.
//   2. import it below and add an entry to an album's `photos` with its TRUE width and height (the page reserves the space
//      from them) and a meaningful `alt` that describes what is in the picture without naming people.
//   3. `caption` is the line shown on the photo. Only state what is known: the captions below come from what is visible
//      in each picture (the event title on the stage screen), not from guesses.
//   4. Optional: `eventId` on an album can point at a real event's id if the page should take its title/date from the API.
//
// Only publish photographs the club has permission to show, especially close-ups of younger students.
import carnivalTeam from "../assets/gallery/tech-carnival-2025-team.jpg";
import carnivalBuzzerQuiz from "../assets/gallery/tech-carnival-2025-buzzer-quiz.jpg";
import studentsAtLaptop from "../assets/gallery/students-at-laptop.jpg";

export const ALBUMS = [
  { id: "tech-carnival-2025", category: "Fests", title: "8th DRMC International Tech Carnival 2025", eventId: null, date: null,
    description: "The club's international tech carnival.",
    photos: [
      { id: "itc25-team", src: carnivalTeam, width: 2048, height: 1280,
        alt: "A large group of students in matching black Tech Carnival polo shirts cheering on a stage, in front of a screen showing the 8th DRMC International Tech Carnival 2025 title",
        caption: "The team on stage at the 8th DRMC International Tech Carnival 2025." },
      { id: "itc25-buzzer-quiz", src: carnivalBuzzerQuiz, width: 2048, height: 1088,
        alt: "Teams seated at three tables on a stage, facing a large screen that reads Buzzer Quiz, 8th DRMC International Tech Carnival 2025, with the audience in the foreground",
        caption: "The Buzzer Quiz at the 8th DRMC International Tech Carnival 2025." },
    ] },
  // The event this picture was taken at is not known from the photo itself, so it is not attributed to one.
  { id: "club-moments", category: "Club life", title: "Club moments", eventId: null, date: null, description: "Students at work.",
    photos: [
      { id: "students-at-laptop", src: studentsAtLaptop, width: 1600, height: 1069,
        alt: "Two young students in school uniform talking across an open laptop in a room full of laptops",
        caption: "Two students working together at a laptop." },
    ] },
];
