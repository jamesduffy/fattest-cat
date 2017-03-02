#!/usr/bin/env node

const request         = require("request-promise");
const opener          = require("opener");
const Promise         = require("bluebird");
const cheerio         = require("cheerio");
const {uniq, compact} = require("lodash");

const SFSPCA_BASE = "https://www.sfspca.org"
const ADOPTION_PAGE = `${SFSPCA_BASE}/adoptions/dogs`;

const fetchDogsHelper = Promise.method((pageNumber, dogsSoFar) => {
  const url = pageNumber === 0 ? ADOPTION_PAGE : `${ADOPTION_PAGE}?page=${pageNumber}`
  return request.get(url)
    .then((adoptionsPage) => {
      const dogs = cheerio(adoptionsPage)
        .find("a")
        .filter((i, tag) => tag.attribs.href && tag.attribs.href.match(/adoptions\/pet-details\/\d+/))
        .map((i, tag) => `${SFSPCA_BASE}${tag.attribs.href}`)
        .toArray();
      if (!dogs || dogs.length === 0) {
        return dogsSoFar;
      } else {
        return fetchDogsHelper(pageNumber + 1, dogsSoFar.concat(dogs));
      }
    })
    .catch((err) => {
      console.log("Error fetching dogs:", err);
      return dogsSoFar;
    });
});
const fetchDogs = () => fetchDogsHelper(0, []);

console.log("Accessing San Francisco SPCA (Dog Department)...");

fetchDogs()
  .then(uniq) // NO DOUBLE CATS
  .tap((dogs) => console.log(`Dog information system accessed. ${dogs.length} dogs found. Beginning weighing process...`))
  .map((url) => {
    return request.get(url)
      // SPCA sometimes returns 403s for some dogs, ignore this.
      .catch((err) => err)
      .then((dogPage) => {
        const $ = cheerio.load(dogPage);
        const name = $(".field-name-title h1").text();
        const weight = $(".field-name-field-animal-weight .field-item").text();
        const lbs = Number(/(\d+)lbs\./.exec(weight)[1]);
        const oz = /(\d+)oz\./.test(weight) ? Number(/(\d+)oz\./.exec(weight)[1]) : 0;
        const isFemale = $(".field-name-field-gender .field-item").text().trim() === "Female";

        console.log("Weighing dog:", name);
        return {name, lbs, oz, isFemale, url}
      })
      // Null for dogs that cannot be parsed.
      .catch(() => {});
  })
  // Filter out unparsable dogs.
  .then(compact)
  .then((dogs) => {
    let fattestDog = {lbs: 0, oz: 0};
    dogs.forEach((dog) => {
      if (dog.lbs > fattestDog.lbs || (dog.lbs === fattestDog.lbs && dog.oz > fattestDog.oz)) {
        fattestDog = dog;
      }
    });
    console.log(`The fattest dog is ${fattestDog.name}. ${(fattestDog.isFemale ? "She" : "He")} weighs ${fattestDog.lbs} lbs and ${fattestDog.oz} oz.`);
    setTimeout(() => console.log("Opening dog profile..."), 2000);
    setTimeout(() => opener(fattestDog.url), 4000);
  });
